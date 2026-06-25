import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { releasePayout } from '@/lib/payout';
import { feeBreakdown } from '@/lib/fees';
import { notify } from '@/lib/notifications';
import { emailWallet } from '@/lib/email';
import { orderDeliveredSeller } from '@/lib/email-templates';

// Buyer confirms receipt of the physical item. This finalizes the order (status -> delivered) and
// RELEASES the seller's escrowed payout: net = price - platform fee - shipping. Only the order's
// buyer can confirm, and the status CAS (.in('status', ['paid','shipped'])) guarantees this runs
// exactly once, so the payout can't double-fire. A payout failure does NOT undo the buyer's
// confirmation — the receipt stands and payout_released stays false for a later retry.
export async function POST(req: Request) {
  try {
    const { order_id, buyer_wallet } = await req.json();
    if (!order_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();

    // Atomically claim the confirmation. Whoever flips paid/shipped -> delivered owns the payout.
    const { data: order, error } = await supabase
      .from('orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', order_id)
      .eq('buyer_wallet', buyer_wallet)
      .in('status', ['paid', 'shipped'])
      .select()
      .single();

    if (error || !order) return NextResponse.json({ error: 'Order not found or already finalized' }, { status: 409 });

    // Confirming receipt = accepting the item, so the buyer can't simultaneously claim it never arrived
    // or wasn't as described: auto-close any active dispute they filed on this order. Best-effort only —
    // a missing disputes table (pre-migration) or write error must never block confirmation or payout.
    try {
      await supabase
        .from('disputes')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('order_id', order.id)
        .in('status', ['open', 'under_review']);
    } catch (disputeErr) {
      console.error('[orders/confirm] could not auto-close dispute:', disputeErr);
    }

    // Net the seller receives: price - platform fee - shipping (never negative). Never let a missing
    // fee (pre-migration NULL) collapse to $0 — re-derive it from price + channel so Visby's cut holds.
    const price    = Number(order.price_usdc ?? 0);
    const fee      = order.platform_fee_usd != null
      ? Number(order.platform_fee_usd)
      : feeBreakdown(price, 0, order.sale_channel ?? undefined).platform_fee_usd;
    const shipping = Number(order.shipping_cost ?? 0);
    const net      = Math.max(0, price - fee - shipping);

    // Derive the payout rail from pay_method when payout_method is NULL (pre-migration rows), so a
    // card sale never falls through to the crypto branch and vice-versa.
    const method = order.payout_method ?? (order.pay_method === 'card' ? 'card' : 'crypto');

    const payout = await releasePayout({
      id: order.id,
      item_id: order.item_id,
      seller_wallet: order.seller_wallet,
      payout_method: method,
      seller_net_usd: net,
      gross_usd: price,
      received_lamports: order.received_lamports ?? null,
      stripe_payment_intent: order.stripe_payment_intent,
    });

    // Persist the payout result, retrying transient write failures. If this drifts (money moved but the
    // row says payout_released=false), the retry-payout endpoint would re-attempt — safe on the card rail
    // (idempotency key dedupes the transfer) but NOT on crypto, so we try hard to record it here.
    let payoutWriteErr: { message?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase
        .from('orders')
        .update({
          seller_net_usd: net,
          payout_released: payout.ok,
          payout_tx: payout.payout_tx,
        })
        .eq('id', order.id);
      payoutWriteErr = error;
      if (!error) break;
    }
    if (payoutWriteErr) {
      console.error('[orders/confirm] payout finished but result failed to persist after retries — MANUAL RECONCILIATION NEEDED:', payoutWriteErr, payout);
    }

    await notify({
      recipient_wallet: order.seller_wallet,
      type: 'order_delivered',
      title: 'Delivery confirmed',
      body: payout.ok
        ? 'The buyer confirmed delivery — your payout has been released.'
        : 'The buyer confirmed delivery.',
      link: '/dashboard',
      data: { order_id: order.id, net },
    });
    void emailWallet(order.seller_wallet, orderDeliveredSeller({ itemId: order.item_id, netUsd: net, payoutReleased: payout.ok }));

    return NextResponse.json({
      ok: true,
      order: { ...order, status: 'delivered', seller_net_usd: net, payout_released: payout.ok },
      payout,
    });
  } catch (err) {
    console.error('[orders/confirm] error:', err);
    return NextResponse.json({ error: 'Could not confirm delivery' }, { status: 500 });
  }
}
