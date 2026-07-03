import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { emailWallet } from '@/lib/email';
import { orderShippedBuyer } from '@/lib/email-templates';
import { shippingConfigured, rateShop, recommendRate, buyLabel, type Addr, type Parcel, type ShipRate } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

// Map the buyer's order.ship_address ({line1,line2,city,state,postal,country}) to a shipping Addr.
function toAddr(shipName: string | null, a: any): Addr | null {
  if (!a || !a.line1 || !a.city || !a.state || !a.postal) return null;
  return {
    name: shipName ?? undefined,
    street1: a.line1, street2: a.line2 || undefined,
    city: a.city, state: a.state, zip: a.postal, country: a.country || 'US',
  };
}

// The seller's saved ship-from (profiles.ship_from) is stored in Addr shape already.
function fromAddr(s: any): Addr | null {
  if (!s || !s.street1 || !s.city || !s.state || !s.zip) return null;
  return {
    name: s.name || undefined,
    street1: s.street1, street2: s.street2 || undefined,
    city: s.city, state: s.state, zip: s.zip, country: s.country || 'US', phone: s.phone || undefined,
  };
}

// Seller marks an order shipped. Two modes:
//  • auto_label (when a carrier is configured): rate-shop seller→buyer across UPS/FedEx/USPS, buy
//    either the seller-selected service or the recommended <=2-day rate, and persist tracking +
//    label_url + shipping_cost (deducted from the seller payout). The rate is re-shopped server-side
//    so a client-sent price is never trusted.
//  • manual: seller supplies carrier + tracking themselves (fallback when no carrier account).
// Only the order's seller, and only while it is still 'paid', can ship it.
export async function POST(req: Request) {
  try {
    const { order_id, seller_wallet, carrier, tracking_number, auto_label, selected_carrier, selected_service } = await req.json();
    if (!order_id || !seller_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, seller_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, item_id, seller_wallet, buyer_wallet, status, ship_name, ship_address')
      .eq('id', order_id)
      .eq('seller_wallet', seller_wallet)
      .single();
    if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'paid') return NextResponse.json({ error: 'Order is not awaiting shipment' }, { status: 409 });

    const nowIso = new Date().toISOString();
    let data: any;
    let label: { tracking_code: string; carrier: string; service: string; rate: number; label_url: string | null; upload_failed?: boolean } | null = null;

    if (auto_label) {
      if (!shippingConfigured()) {
        return NextResponse.json({ error: 'No carriers configured — connect UPS/FedEx/USPS or enter tracking manually.' }, { status: 400 });
      }

      const to = toAddr(order.ship_name, order.ship_address);
      if (!to) return NextResponse.json({ error: 'Buyer has not provided a complete shipping address yet.' }, { status: 400 });

      const { data: profile } = await supabase
        .from('profiles').select('ship_from').eq('wallet', seller_wallet).maybeSingle();
      const from = fromAddr(profile?.ship_from);
      if (!from) return NextResponse.json({ error: 'Set your ship-from address in payout settings before buying a label.', code: 'no_ship_from' }, { status: 400 });

      const { data: item } = await supabase
        .from('items').select('weight_oz, length_in, width_in, height_in').eq('id', order.item_id).maybeSingle();
      const weight = Number(item?.weight_oz);
      if (!weight || weight <= 0) return NextResponse.json({ error: 'This item has no shipping weight set — edit the listing to add it.', code: 'no_weight' }, { status: 400 });

      const parcel: Parcel = {
        weight_oz: weight,
        length_in: item?.length_in ? Number(item.length_in) : undefined,
        width_in:  item?.width_in  ? Number(item.width_in)  : undefined,
        height_in: item?.height_in ? Number(item.height_in) : undefined,
      };

      // Re-shop server-side; never trust a client-sent price.
      const shopped = await rateShop(from, to, parcel);
      if (!shopped || !shopped.rates.length) {
        return NextResponse.json({ error: 'No carrier rates were returned for this shipment.' }, { status: 502 });
      }

      let chosen: ShipRate | null;
      if (selected_carrier && selected_service) {
        const wantCarrier = String(selected_carrier).toLowerCase();
        const wantService = String(selected_service);
        chosen = shopped.rates.find(
          r => r.carrier.toLowerCase() === wantCarrier && r.service_code === wantService,
        ) ?? null;
        if (!chosen) return NextResponse.json({ error: 'The selected shipping service is no longer available — re-shop rates.' }, { status: 404 });
      } else {
        chosen = recommendRate(shopped.rates);
        if (!chosen) return NextResponse.json({ error: 'Could not select a shipping rate.' }, { status: 502 });
      }

      // CLAIM the order out of 'paid' BEFORE spending money on a label. A concurrent or retried ship
      // request loses this CAS and is rejected, so a label can never be bought (and paid for) twice.
      const { data: claimed, error: claimErr } = await supabase
        .from('orders')
        .update({ status: 'shipped', shipped_at: nowIso })
        .eq('id', order_id).eq('seller_wallet', seller_wallet).eq('status', 'paid')
        .select()
        .single();
      if (claimErr || !claimed) return NextResponse.json({ error: 'Order is no longer awaiting shipment.' }, { status: 409 });

      // Buy the label. If it fails, roll the order back to 'paid' so the seller can retry — never strand
      // a 'shipped' order with no carrier label.
      let bought;
      try {
        bought = await buyLabel(chosen, from, to, parcel);
      } catch (labelErr) {
        await supabase.from('orders').update({ status: 'paid', shipped_at: null }).eq('id', order_id);
        const msg = labelErr instanceof Error ? labelErr.message : 'Label purchase failed.';
        return NextResponse.json({ error: msg }, { status: 502 });
      }
      if (!bought) {
        await supabase.from('orders').update({ status: 'paid', shipped_at: null }).eq('id', order_id);
        return NextResponse.json({ error: 'Label purchase failed.' }, { status: 502 });
      }

      // Persist the label file: hosted URL if the carrier returns one, else upload the base64 to storage.
      let labelUrl = bought.label_url;
      let uploadFailed = false;
      if (!labelUrl && bought.label_base64) {
        const ext = (bought.label_format ?? 'PDF').toLowerCase();
        const contentType = bought.label_format === 'PDF' ? 'application/pdf'
          : bought.label_format === 'PNG' ? 'image/png'
          : bought.label_format === 'GIF' ? 'image/gif'
          : 'application/octet-stream';
        const path = `labels/${order_id}.${ext}`;
        await supabase.storage.createBucket('shipping-labels', { public: true }).catch(() => {});
        const buffer = Buffer.from(bought.label_base64, 'base64');
        const { error: upErr } = await supabase.storage
          .from('shipping-labels')
          .upload(path, buffer, { contentType, upsert: true });
        if (!upErr) {
          labelUrl = supabase.storage.from('shipping-labels').getPublicUrl(path).data.publicUrl;
        } else {
          // Label was bought (tracking is valid) but we couldn't host the image — flag it so the seller
          // knows to grab the label from the carrier; don't fail the whole shipment over it.
          uploadFailed = true;
          console.error('[orders/ship] label purchased but storage upload failed:', upErr.message);
        }
      }

      // Finalize tracking on the already-claimed (shipped) order.
      const { data: finalRow } = await supabase
        .from('orders')
        .update({
          tracking_carrier: bought.carrier,
          tracking_number:  bought.tracking_code,
          label_url:        labelUrl,
          shipping_cost:    bought.rate,
          shipping_service: bought.service,
          // Column predates the provider swap (named for EasyPost) — now holds the AtoShip lbl_ id,
          // kept so an unused label can be voided/refunded.
          ep_shipment_id:   bought.label_id ?? null,
        })
        .eq('id', order_id)
        // A refund can flip the order 'shipped' -> 'refunded' while we were buying the label. Only write
        // tracking if it's still 'shipped'; otherwise leave the refund intact and flag the orphan label.
        .eq('status', 'shipped')
        .select()
        .single();
      if (!finalRow) {
        console.error('[orders/ship] label bought but order no longer shipped (likely refunded mid-purchase) — orphan label needs manual handling:', { order_id, tracking: bought.tracking_code, cost: bought.rate });
        return NextResponse.json({ error: 'This order changed (e.g. was refunded) while the label was being purchased — the label needs manual handling.', code: 'order_changed' }, { status: 409 });
      }
      data = finalRow;
      label = {
        tracking_code: bought.tracking_code,
        carrier: bought.carrier,
        service: bought.service,
        rate: bought.rate,
        label_url: labelUrl,
        ...(uploadFailed ? { upload_failed: true } : {}),
      };
    } else {
      // Manual fallback — no money is spent, so a single atomic CAS is enough.
      if (!carrier || !tracking_number) return NextResponse.json({ error: 'Enter carrier and tracking number' }, { status: 400 });
      const c = String(carrier).trim(), tn = String(tracking_number).trim();
      if (c.length > 64 || tn.length > 128) return NextResponse.json({ error: 'Carrier or tracking number too long' }, { status: 400 });
      const { data: row, error } = await supabase
        .from('orders')
        .update({ status: 'shipped', shipped_at: nowIso, tracking_carrier: c, tracking_number: tn })
        .eq('id', order_id).eq('seller_wallet', seller_wallet).eq('status', 'paid')
        .select()
        .single();
      if (error || !row) return NextResponse.json({ error: 'Order not found or not shippable' }, { status: 409 });
      data = row;
    }

    const trackingCarrier = data.tracking_carrier as string | undefined;
    const trackingNumber  = data.tracking_number as string | undefined;
    const shipBody = trackingCarrier && trackingNumber
      ? `${trackingCarrier} tracking ${trackingNumber}.`
      : 'Your item is on the way.';
    notify({
      recipient_wallet: order.buyer_wallet,
      type: 'order_shipped',
      title: 'Your order shipped',
      body: shipBody,
      link: '/order/' + order.item_id,
      data: { order_id, tracking_number: trackingNumber ?? null },
    });
    void emailWallet(order.buyer_wallet, orderShippedBuyer({ itemId: order.item_id, carrier: trackingCarrier ?? null, tracking: trackingNumber ?? null }));

    return NextResponse.json({ ok: true, order: data, label });
  } catch (err) {
    console.error('[orders/ship] error:', err);
    return NextResponse.json({ error: 'Could not mark shipped' }, { status: 500 });
  }
}
