import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { finalizeDelivery } from '@/lib/order-finalize';

// Buyer confirms receipt of the physical item. This finalizes the order (status -> delivered) and
// RELEASES the seller's escrowed payout: net = price - platform fee - shipping. Only the order's
// buyer can confirm, and the status CAS (.in('status', ['paid','shipped'])) guarantees this runs
// exactly once, so the payout can't double-fire. A payout failure does NOT undo the buyer's
// confirmation — the receipt stands and payout_released stays false for a later retry.
//
// The actual finalize logic (CAS claim, dispute auto-close, net calc, payout release, notify/email)
// lives in src/lib/order-finalize.ts (finalizeDelivery), shared with the carrier webhook
// (src/app/api/shipping/webhook/route.ts) so there's exactly one code path for the money-moving parts.
export async function POST(req: Request) {
  try {
    const { order_id, buyer_wallet } = await req.json();
    if (!order_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await finalizeDelivery(order_id, { source: 'buyer', buyerWallet: buyer_wallet });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    if (!result.claimed) return NextResponse.json({ error: 'Order not found or already finalized' }, { status: 409 });

    return NextResponse.json({
      ok: true,
      order: result.order,
      payout: { ok: result.payout_released, payout_tx: result.payout_tx, ...(result.payout_error ? { error: result.payout_error } : {}) },
    });
  } catch (err) {
    console.error('[orders/confirm] error:', err);
    return NextResponse.json({ error: 'Could not confirm delivery' }, { status: 500 });
  }
}
