import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { rateShop, shippingConfigured, configuredCarriers, type Addr, type Parcel } from '@/lib/shipping';

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

// Live rate options for one paid order, so the seller's FulfillRow UI can show the carrier choice
// before committing to a label. Read-only: rate-shops seller→buyer and returns the normalized list
// plus the recommended (cheapest in-window) rate id. Only the order's seller, on a still-'paid'
// order, may call this.
export async function POST(req: Request) {
  try {
    const { order_id, seller_wallet } = await req.json();
    if (!order_id || !seller_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, seller_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, item_id, seller_wallet, status, ship_name, ship_address')
      .eq('id', order_id)
      .eq('seller_wallet', seller_wallet)
      .single();
    if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'paid') return NextResponse.json({ error: 'Order is not awaiting shipment' }, { status: 409 });

    const to = toAddr(order.ship_name, order.ship_address);
    if (!to) return NextResponse.json({ error: 'Buyer has not provided a complete shipping address yet.', code: 'no_ship_to' }, { status: 400 });

    const { data: profile } = await supabase
      .from('profiles').select('ship_from').eq('wallet', seller_wallet).maybeSingle();
    const from = fromAddr(profile?.ship_from);
    if (!from) return NextResponse.json({ error: 'Set your ship-from address in payout settings before rate-shopping.', code: 'no_ship_from' }, { status: 400 });

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

    if (!shippingConfigured()) return NextResponse.json({ error: 'No carriers are configured yet.' }, { status: 400 });

    const shopped = await rateShop(from, to, parcel);
    if (!shopped || !shopped.rates.length) return NextResponse.json({ error: 'No carrier rates returned.' }, { status: 502 });

    const recommended_id = shopped.rates.find(r => r.recommended)?.id ?? null;

    return NextResponse.json({ rates: shopped.rates, recommended_id, carriers: configuredCarriers() });
  } catch (err) {
    console.error('[shipping/rates] error:', err);
    return NextResponse.json({ error: 'Could not load shipping rates' }, { status: 500 });
  }
}
