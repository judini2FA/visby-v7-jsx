import { createServiceClient } from '@/lib/supabase/service';
import { feeBreakdown } from '@/lib/fees';
import { notify } from '@/lib/notifications';
import { emailWallet } from '@/lib/email';
import { orderSoldSeller, orderPlacedBuyer } from '@/lib/email-templates';
import { captureError } from '@/lib/monitoring';
import { consumeOffer } from '@/lib/offers';

// Creates the physical-fulfillment order for a completed purchase. Additive and tolerant:
// if the orders table doesn't exist yet (migration not run) this is a silent no-op, and it
// dedupes so repeated settlement calls for the same item don't create duplicate orders.
// Records the platform fee tier at purchase; the seller's net (price - fee - shipping) is finalized
// and paid out at delivery confirmation, since shipping isn't known until fulfillment.
export async function createOrder(o: {
  item_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  price_usdc: number | null;
  pay_method: string;
  nft_tx?: string | null;
  sale_channel?: string;             // 'visby' (default, 9%) | 'partner' (3.5%)
  stripe_payment_intent?: string | null;
  received_lamports?: number | null; // SOL lamports received at treasury (crypto pay) — feeds the payout FX cap
}): Promise<boolean> {        // true if an order row exists/was created; false = NOT recorded (reconcile)
  try {
    const supabase = createServiceClient();

    // Dedup against an ACTIVE order only (paid/shipped). This both absorbs Stripe's double webhook
    // delivery (session.completed + payment_intent.succeeded fire for one sale) and still allows an
    // item to be re-sold after a previous order is delivered/cancelled. A partial unique index on
    // active orders (migration_fees.sql) makes the concurrent-insert race atomic.
    const { data: existing, error: checkErr } = await supabase
      .from('orders')
      .select('id, stripe_payment_intent')
      .eq('item_id', o.item_id)
      .in('status', ['paid', 'shipped'])
      .limit(1);
    if (checkErr) {                       // orders table missing/unreachable — can't record; surface for reconcile
      console.error('[createOrder] dedup check failed — order NOT recorded', { item_id: o.item_id, buyer_wallet: o.buyer_wallet, error: checkErr.message });
      return false;
    }
    if (existing && existing.length) {
      // Order already exists — but backfill the Stripe PaymentIntent if this caller has it and the stored
      // row doesn't. For hosted checkout the client confirm and the webhook race to create the order, and
      // only one of them carries the PI; without it the card payout AND refund can't find the charge.
      const row = existing[0] as { id: string; stripe_payment_intent: string | null };
      if (o.stripe_payment_intent && !row.stripe_payment_intent) {
        await supabase.from('orders').update({ stripe_payment_intent: o.stripe_payment_intent }).eq('id', row.id);
      }
      return true;
    }

    // Snapshot the buyer's saved default shipping address onto the order so the seller can fulfill
    // without a separate post-purchase address step. Tolerant: if profiles.ship_to doesn't exist yet
    // (migration not run) or the buyer hasn't saved one, the order's address stays null and the order
    // page's address form remains as the fallback.
    let ship_name: string | null = null;
    let ship_address: Record<string, string> | null = null;
    try {
      const { data: prof } = await supabase.from('profiles').select('ship_to').eq('wallet', o.buyer_wallet).maybeSingle();
      const st = prof?.ship_to as Record<string, string> | null | undefined;
      if (st && st.line1 && st.city && st.state && st.postal) {
        ship_name = st.name ?? null;
        ship_address = {
          line1: st.line1, line2: st.line2 ?? '', city: st.city,
          state: st.state, postal: st.postal, country: st.country ?? 'US',
        };
      }
    } catch { /* ship_to column absent — skip, order page collects it */ }

    const fees = feeBreakdown(o.price_usdc ?? 0, 0, o.sale_channel);
    const payout_method = o.pay_method === 'card' ? 'card' : 'crypto';

    // TODO(4.7): assertTransition here — this is a row CREATE (not a transition), always at
    // 'paid'; a future guard would just assert the literal equals 'paid', not call the state
    // machine. See src/lib/order-state-machine.ts.
    const base = {
      item_id:       o.item_id,
      buyer_wallet:  o.buyer_wallet,
      seller_wallet: o.seller_wallet,
      price_usdc:    o.price_usdc,
      pay_method:    o.pay_method,
      status:        'paid',
      nft_tx:        o.nft_tx ?? null,
      ship_name,
      ship_address,
    };

    // Insert with the richest column set the schema supports. PostgREST rejects the WHOLE insert if any
    // column is absent, so degrade to a minimal base insert on error. Two guarantees the old code lacked:
    //  (1) never fail SILENTLY — a settled purchase that can't be recorded is logged loudly so it's
    //      reconcilable (sol_payments holds the matching signature); (2) never drop received_lamports (the
    //      FX-cap field) as collateral of a missing FEE column — backfill it via a tolerant UPDATE.
    let createdId: string | null = null;
    const { data: full, error: insErr } = await supabase.from('orders').insert({
      ...base,
      sale_channel:          fees.channel,
      fee_bps:               fees.fee_bps,
      platform_fee_usd:      fees.platform_fee_usd,
      payout_method,
      stripe_payment_intent: o.stripe_payment_intent ?? null,
      received_lamports:     o.received_lamports ?? null,
    }).select('id').maybeSingle();

    if (!insErr) {
      createdId = full?.id ?? null;
    } else {
      const { data: baseRow, error: baseErr } = await supabase.from('orders').insert(base).select('id').maybeSingle();
      if (baseErr) {
        console.error('[createOrder] ORDER NOT RECORDED after settled purchase — reconcile manually', {
          item_id: o.item_id, buyer_wallet: o.buyer_wallet, seller_wallet: o.seller_wallet,
          pay_method: o.pay_method, error: baseErr.message,
        });
        captureError(baseErr, { stage: 'createOrder base insert', item_id: o.item_id, buyer_wallet: o.buyer_wallet, seller_wallet: o.seller_wallet, pay_method: o.pay_method });
        return false;
      }
      createdId = baseRow?.id ?? null;
      // Backfill received_lamports if its column exists (it can, even when a fee column doesn't). Tolerant:
      // a missing column (42703 / PGRST204) is expected pre-migration; anything else is logged.
      if (createdId && o.received_lamports != null) {
        const { error: bfErr } = await supabase.from('orders').update({ received_lamports: o.received_lamports }).eq('id', createdId);
        if (bfErr && bfErr.code !== '42703' && bfErr.code !== 'PGRST204') {
          console.error('[createOrder] received_lamports backfill failed', { id: createdId, error: bfErr.message });
        }
      }
    }

    // Offers (7.3): mark this buyer's accepted offer on the item consumed now that the sale is recorded.
    // Best-effort + no-op when there was no offer (the item selling once is the real single-use guard).
    if (createdId) void consumeOffer(o.item_id, o.buyer_wallet);

    await notify({
      recipient_wallet: o.seller_wallet,
      type: 'order_sold',
      title: 'Your item sold',
      body: 'You made a sale — open your dashboard to fulfill it.',
      link: '/dashboard',
      data: { item_id: o.item_id, buyer_wallet: o.buyer_wallet },
    });
    void emailWallet(o.seller_wallet, orderSoldSeller({ itemId: o.item_id, priceUsd: o.price_usdc }));
    void emailWallet(o.buyer_wallet, orderPlacedBuyer({ itemId: o.item_id, priceUsd: o.price_usdc }));
    return true;
  } catch (err) {
    console.error('[createOrder] unexpected failure — order may not be recorded', {
      item_id: o.item_id, buyer_wallet: o.buyer_wallet, error: err instanceof Error ? err.message : String(err),
    });
    captureError(err, { stage: 'createOrder', item_id: o.item_id, buyer_wallet: o.buyer_wallet, seller_wallet: o.seller_wallet, pay_method: o.pay_method });
    return false;
  }
}
