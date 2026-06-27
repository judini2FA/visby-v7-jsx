import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { refundOrder } from '@/lib/refund';
import { notify } from '@/lib/notifications';
import { emailWallet } from '@/lib/email';
import { disputeResolvedBuyer, refundIssuedBuyer } from '@/lib/email-templates';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['refund', 'deny', 'under_review'] as const;
type ResolveAction = typeof VALID_ACTIONS[number];

function isMissingSchema(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === '42703' ||
    !!error.message?.includes('does not exist')
  );
}

async function gateAdmin(req: Request, wallet: string | undefined | null): Promise<NextResponse | null> {
  if (!(await callerOwnsWallet(req, wallet))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await isAdminRole(wallet, 'finance'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    const status = searchParams.get('status') ?? 'open';

    const denied = await gateAdmin(req, wallet);
    if (denied) return denied;

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('disputes')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingSchema(error)) return NextResponse.json({ disputes: [] });
      console.error('[disputes/resolve/GET] error:', error);
      return NextResponse.json({ disputes: [] });
    }

    return NextResponse.json({ disputes: data ?? [] });
  } catch (err) {
    console.error('[disputes/resolve/GET] error:', err);
    return NextResponse.json({ disputes: [] });
  }
}

export async function PATCH(req: Request) {
  try {
    const { wallet, dispute_id, action, resolution_note } = await req.json();

    const denied = await gateAdmin(req, wallet);
    if (denied) return denied;

    if (!VALID_ACTIONS.includes(action as ResolveAction)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    if (!dispute_id) {
      return NextResponse.json({ error: 'dispute_id is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const supabase = createServiceClient();

    const { data: dispute, error: disputeErr } = await supabase
      .from('disputes')
      .select('*')
      .eq('id', dispute_id)
      .maybeSingle();

    if (disputeErr) {
      if (isMissingSchema(disputeErr)) {
        return NextResponse.json({ error: 'Disputes are not available yet' }, { status: 503 });
      }
      console.error('[disputes/resolve/PATCH] dispute lookup error:', disputeErr);
      return NextResponse.json({ error: 'Could not resolve dispute' }, { status: 500 });
    }
    if (!dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // deny / under_review: CAS the dispute out of an ACTIVE status. A replay (or a request racing the
    // refund path) that finds the dispute already terminal claims no row → 409, so terminal disputes
    // can't be silently re-mutated and orders.disputed can't be flipped back on a resolved order.
    if (action === 'under_review' || action === 'deny') {
      const patch = action === 'under_review'
        ? { status: 'under_review', updated_at: now, resolved_by: wallet }
        : {
            status: 'denied',
            resolution_note: typeof resolution_note === 'string' ? resolution_note : null,
            updated_at: now,
            resolved_at: now,
            resolved_by: wallet,
          };
      const { data: claimed, error } = await supabase
        .from('disputes')
        .update(patch)
        .eq('id', dispute_id)
        .in('status', ['open', 'under_review'])
        .select('order_id')
        .maybeSingle();
      if (error) {
        if (isMissingSchema(error)) {
          return NextResponse.json({ error: 'Disputes are not available yet' }, { status: 503 });
        }
        console.error(`[disputes/resolve/PATCH] ${action} error:`, error);
        return NextResponse.json({ error: 'Could not resolve dispute' }, { status: 500 });
      }
      if (!claimed) {
        return NextResponse.json({ error: 'Dispute already resolved' }, { status: 409 });
      }
      if (action === 'deny') {
        await supabase.from('orders').update({ disputed: false }).eq('id', dispute.order_id);
        await notify({
          recipient_wallet: dispute.buyer_wallet,
          type: 'dispute_resolved',
          title: 'Dispute reviewed',
          body: 'Your dispute was reviewed and closed.',
          link: '/dashboard',
          data: { order_id: dispute.order_id },
        });
        void emailWallet(dispute.buyer_wallet, disputeResolvedBuyer({ itemId: dispute.order_id }));
      }
      void logSecurityEvent({ wallet, event: 'dispute_resolved', detail: { dispute_id, order_id: dispute.order_id, action }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
      return NextResponse.json({ ok: true });
    }

    // action === 'refund' — moves money, so it must be exactly-once and must never pay the buyer while
    // the seller can still be paid. Two atomic claims guard it:
    //   (1) CAS the DISPUTE out of an active status. Only the call that wins proceeds; a double-click or
    //       retry loses the CAS → 409, so the buyer is never refunded twice.
    const { data: claimedDispute, error: claimErr } = await supabase
      .from('disputes')
      .update({
        status: 'refunded',
        resolution_note: typeof resolution_note === 'string' ? resolution_note : null,
        updated_at: now,
        resolved_at: now,
        resolved_by: wallet,
      })
      .eq('id', dispute_id)
      .in('status', ['open', 'under_review'])
      .select('order_id')
      .maybeSingle();
    if (claimErr) {
      if (isMissingSchema(claimErr)) {
        return NextResponse.json({ error: 'Disputes are not available yet' }, { status: 503 });
      }
      console.error('[disputes/resolve/PATCH] dispute claim error:', claimErr);
      return NextResponse.json({ error: 'Could not resolve dispute' }, { status: 500 });
    }
    if (!claimedDispute) {
      return NextResponse.json({ error: 'Dispute already resolved' }, { status: 409 });
    }

    //   (2) LOCK the ORDER out of the payable set BEFORE any money moves. The confirm/payout path CASes
    //       on status IN (paid,shipped) & payout_released=false, so flipping the order to 'refunded'
    //       here makes the two mutually exclusive: exactly one of {refund buyer, pay seller} can win.
    const { data: lockedOrder, error: lockErr } = await supabase
      .from('orders')
      .update({ status: 'refunded', disputed: false, refunded_at: now })
      .eq('id', dispute.order_id)
      // include 'delivered' so an order whose seller payout FAILED (delivered but payout_released=false,
      // funds still in escrow) can still be refunded. payout_released=false keeps this mutually exclusive
      // with a successful payout — a paid-out order can never be refunded here.
      .in('status', ['paid', 'shipped', 'delivered'])
      .eq('payout_released', false)
      .select('*')
      .maybeSingle();
    if (lockErr || !lockedOrder) {
      // No money has moved yet — roll the dispute claim back so it isn't falsely shown as refunded.
      await supabase.from('disputes')
        .update({ status: dispute.status, resolved_at: null })
        .eq('id', dispute_id);
      if (lockErr && isMissingSchema(lockErr)) {
        return NextResponse.json({ error: 'Refunds are unavailable until the disputes migration is applied.' }, { status: 503 });
      }
      if (lockErr) {
        console.error('[disputes/resolve/PATCH] order lock failed:', lockErr);
        return NextResponse.json({ error: 'Could not lock order for refund' }, { status: 500 });
      }
      return NextResponse.json(
        { error: 'Order is already settled, paid out, or refunded — refund must be handled manually.' },
        { status: 409 },
      );
    }

    //   (3) Money moves. The order is locked to 'refunded', so the seller can no longer be paid for it.
    //       A failure here leaves the order locked but un-refunded — surface it loudly for manual
    //       reconciliation rather than silently returning ok.
    const refund = await refundOrder({
      id: lockedOrder.id,
      item_id: lockedOrder.item_id,
      buyer_wallet: lockedOrder.buyer_wallet,
      pay_method: lockedOrder.pay_method,
      payout_method: lockedOrder.payout_method,
      payout_released: lockedOrder.payout_released,
      price_usdc: lockedOrder.price_usdc,
      stripe_payment_intent: lockedOrder.stripe_payment_intent,
    });
    if (!refund.ok) {
      return NextResponse.json(
        { error: `Refund transfer failed after the order was locked — manual reconciliation needed: ${refund.error}` },
        { status: 502 },
      );
    }

    //   (4) Record the refund tx id (money already moved; statuses already set). Best-effort.
    await supabase.from('orders').update({ refund_tx: refund.refund_tx }).eq('id', lockedOrder.id);
    await supabase.from('disputes')
      .update({ refund_amount_usd: lockedOrder.price_usdc, refund_tx: refund.refund_tx })
      .eq('id', dispute_id);

    await notify({
      recipient_wallet: lockedOrder.buyer_wallet,
      type: 'dispute_resolved',
      title: 'Dispute resolved — refunded',
      body: 'Your payment has been returned.',
      link: '/order/' + lockedOrder.item_id,
      data: { order_id: lockedOrder.id },
    });
    void emailWallet(lockedOrder.buyer_wallet, refundIssuedBuyer({ itemId: lockedOrder.item_id, priceUsd: lockedOrder.price_usdc }));

    void logSecurityEvent({ wallet, event: 'dispute_resolved', detail: { dispute_id, order_id: lockedOrder.id, action, amount: lockedOrder.price_usdc }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
    return NextResponse.json({ ok: true, refund });
  } catch (err) {
    console.error('[disputes/resolve/PATCH] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
