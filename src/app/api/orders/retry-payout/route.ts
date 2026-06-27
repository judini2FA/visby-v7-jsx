import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { releasePayout } from '@/lib/payout';
import { feeBreakdown } from '@/lib/fees';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Re-attempts a seller payout that FAILED at delivery confirmation (order delivered but payout_released
// still false — money owed but stuck in escrow). The buyer's receipt already stands; this only retries
// the transfer. Triggerable by the order's seller (they're owed the money) or an admin.
//
// Concurrency/idempotency: the payout is claimed by atomically flipping payout_released false->true
// BEFORE moving money, so two concurrent retries can't both pay. If the transfer then fails, the claim
// is rolled back to false so it remains retryable. (We never flip payout_released true except as this
// claim, and only KEEP it true when the transfer succeeded.)
export async function POST(req: Request) {
  try {
    const { order_id, wallet } = await req.json();
    if (!order_id || !wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .maybeSingle();
    if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Only the order's seller or an admin may retry the payout.
    if (order.seller_wallet !== wallet && !(await isAdminRole(wallet, 'finance'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Atomic claim: only the caller that flips payout_released false->true on a delivered order proceeds.
    const { data: claimed } = await supabase
      .from('orders')
      .update({ payout_released: true })
      .eq('id', order_id)
      .eq('status', 'delivered')
      .eq('payout_released', false)
      .select('*')
      .maybeSingle();
    if (!claimed) {
      return NextResponse.json({ error: 'Order is not awaiting a payout retry (already paid, or not delivered).' }, { status: 409 });
    }

    // If a payout_tx is already recorded, the transfer actually happened and only the released flag had
    // drifted — keep payout_released=true (now set by the claim) and do NOT re-pay.
    if (claimed.payout_tx) {
      return NextResponse.json({ ok: true, already_paid: true, payout_tx: claimed.payout_tx });
    }

    // Re-derive the net exactly as the confirm route does: price - platform fee - shipping (never let a
    // missing fee collapse it to price). Re-derive fee from price+channel when the stored value is null.
    const price    = Number(claimed.price_usdc ?? 0);
    const fee      = claimed.platform_fee_usd != null
      ? Number(claimed.platform_fee_usd)
      : feeBreakdown(price, 0, claimed.sale_channel ?? undefined).platform_fee_usd;
    const shipping = Number(claimed.shipping_cost ?? 0);
    const net      = Math.max(0, price - fee - shipping);
    const method   = claimed.payout_method ?? (claimed.pay_method === 'card' ? 'card' : 'crypto');

    const payout = await releasePayout({
      id: claimed.id,
      item_id: claimed.item_id,
      seller_wallet: claimed.seller_wallet,
      payout_method: method,
      seller_net_usd: net,
      gross_usd: price,
      received_lamports: claimed.received_lamports ?? null,
      stripe_payment_intent: claimed.stripe_payment_intent,
    });

    if (!payout.ok) {
      // Roll the claim back so the payout can be retried again later.
      await supabase.from('orders').update({ payout_released: false }).eq('id', order_id);
      return NextResponse.json({ error: payout.error ?? 'Payout failed', payout }, { status: 502 });
    }

    await supabase
      .from('orders')
      .update({ seller_net_usd: net, payout_tx: payout.payout_tx })
      .eq('id', order_id);

    void logSecurityEvent({ wallet, event: 'payout_retried', detail: { order_id, amount: net, result_or_status: 'paid' }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });

    return NextResponse.json({ ok: true, payout, net });
  } catch (err) {
    console.error('[orders/retry-payout] error:', err);
    return NextResponse.json({ error: 'Could not retry payout' }, { status: 500 });
  }
}
