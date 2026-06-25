import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { notify } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { reviewer_wallet, order_id, rating, comment } = await req.json();

    if (!reviewer_wallet || !order_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const ok = await callerOwnsWallet(req, reviewer_wallet);
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('item_id, buyer_wallet, seller_wallet, status')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.buyer_wallet !== reviewer_wallet) {
      return NextResponse.json({ error: 'Only the buyer can review this order' }, { status: 403 });
    }

    if (order.status !== 'delivered') {
      return NextResponse.json({ error: 'You can review once the order is delivered' }, { status: 400 });
    }

    const trimmedComment =
      typeof comment === 'string' ? comment.trim().slice(0, 2000) : null;

    const { data: review, error: upsertErr } = await supabase
      .from('reviews')
      .upsert(
        {
          order_id,
          item_id: order.item_id,
          reviewer_wallet,
          seller_wallet: order.seller_wallet,
          rating,
          comment: trimmedComment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'order_id,reviewer_wallet' }
      )
      .select()
      .single();

    if (upsertErr) {
      const msg =
        upsertErr.message?.includes('does not exist') ||
        upsertErr.code === '42P01' || upsertErr.code === 'PGRST205'
          ? 'Reviews table is not available yet'
          : 'Could not save review';
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    await notify({
      recipient_wallet: order.seller_wallet,
      type: 'review',
      title: 'New review',
      body: 'You received a ' + rating + '-star review.',
      link: '/dashboard',
      data: { rating },
    });

    return NextResponse.json({ ok: true, review });
  } catch (err) {
    console.error('[reviews/POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const order_id = searchParams.get('order_id');

    if (!order_id) {
      return NextResponse.json({ review: null });
    }

    const supabase = createServiceClient();

    // Public read used only to prefill the buyer's own form — return rating/comment only,
    // never the wallet addresses on the row.
    const { data: review, error } = await supabase
      .from('reviews')
      .select('id, rating, comment')
      .eq('order_id', order_id)
      .single();

    if (error) {
      return NextResponse.json({ review: null });
    }

    return NextResponse.json({ review: review ?? null });
  } catch (err) {
    console.error('[reviews/GET] error:', err);
    return NextResponse.json({ review: null });
  }
}
