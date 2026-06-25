import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { emailWallet } from '@/lib/email';
import { disputeOpenedSeller } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';

const VALID_KINDS = ['not_received', 'not_as_described', 'damaged', 'counterfeit', 'return', 'other'] as const;
type DisputeKind = typeof VALID_KINDS[number];

function isMissingSchema(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === '42703' ||
    !!error.message?.includes('does not exist')
  );
}

export async function POST(req: Request) {
  try {
    const { buyer_wallet, order_id, kind, reason } = await req.json();

    if (!(await callerOwnsWallet(req, buyer_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!VALID_KINDS.includes(kind as DisputeKind)) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const cappedReason = reason.slice(0, 2000);

    const supabase = createServiceClient();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .maybeSingle();

    if (orderErr) {
      if (isMissingSchema(orderErr)) {
        return NextResponse.json({ error: 'Disputes are not available yet' }, { status: 503 });
      }
      console.error('[disputes/POST] order lookup error:', orderErr);
      return NextResponse.json({ error: 'Could not open dispute' }, { status: 500 });
    }

    if (!order || order.buyer_wallet !== buyer_wallet) {
      return NextResponse.json({ error: 'Order not found' }, { status: 403 });
    }
    if (order.status === 'cancelled' || order.status === 'refunded') {
      return NextResponse.json({ error: 'This order can no longer be disputed.' }, { status: 409 });
    }
    if (order.payout_released === true) {
      return NextResponse.json({ error: 'This order is already settled; contact support.' }, { status: 409 });
    }

    const { error: insertErr } = await supabase.from('disputes').insert({
      order_id,
      item_id: order.item_id,
      buyer_wallet,
      seller_wallet: order.seller_wallet,
      kind,
      reason: cappedReason,
      status: 'open',
    });

    if (insertErr) {
      if (insertErr.code === '23505') {
        return NextResponse.json({ error: 'A dispute is already open for this order.' }, { status: 409 });
      }
      if (isMissingSchema(insertErr)) {
        return NextResponse.json({ error: 'Disputes are not available yet' }, { status: 503 });
      }
      console.error('[disputes/POST] insert error:', insertErr);
      return NextResponse.json({ error: 'Could not open dispute' }, { status: 500 });
    }

    await supabase.from('orders').update({ disputed: true }).eq('id', order_id);

    await notify({
      recipient_wallet: order.seller_wallet,
      type: 'dispute_opened',
      title: 'A problem was reported',
      body: 'A buyer opened a dispute on one of your sales.',
      link: '/dashboard',
      data: { order_id: order.id, kind },
    });
    void emailWallet(order.seller_wallet, disputeOpenedSeller({ itemId: order.item_id, kind }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[disputes/POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    const role = searchParams.get('role') === 'seller' ? 'seller' : 'buyer';

    if (!(await callerOwnsWallet(req, wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    const column = role === 'seller' ? 'seller_wallet' : 'buyer_wallet';
    const { data, error } = await supabase
      .from('disputes')
      .select('*')
      .eq(column, wallet)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingSchema(error)) return NextResponse.json({ disputes: [] });
      console.error('[disputes/GET] error:', error);
      return NextResponse.json({ disputes: [] });
    }

    return NextResponse.json({ disputes: data ?? [] });
  } catch (err) {
    console.error('[disputes/GET] error:', err);
    return NextResponse.json({ disputes: [] });
  }
}

export async function DELETE(req: Request) {
  try {
    const { buyer_wallet, dispute_id } = await req.json();

    if (!(await callerOwnsWallet(req, buyer_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!dispute_id) {
      return NextResponse.json({ error: 'dispute_id is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: closed, error } = await supabase
      .from('disputes')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', dispute_id)
      .eq('buyer_wallet', buyer_wallet)
      .in('status', ['open', 'under_review'])
      .select('order_id')
      .maybeSingle();

    if (error) {
      if (isMissingSchema(error)) {
        return NextResponse.json({ error: 'Disputes are not available yet' }, { status: 503 });
      }
      console.error('[disputes/DELETE] error:', error);
      return NextResponse.json({ error: 'Could not withdraw dispute' }, { status: 500 });
    }

    if (closed?.order_id) {
      await supabase.from('orders').update({ disputed: false }).eq('id', closed.order_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[disputes/DELETE] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
