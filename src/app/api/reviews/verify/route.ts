import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyReviewToken } from '@/lib/review-token';

export const dynamic = 'force-dynamic';

// The emailed token is the bearer credential for this endpoint — it's HMAC-signed, expiring, and bound
// to one order+buyer, so it safely reveals that buyer's own order summary to render the review form.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const v = verifyReviewToken(token);
  if (!v) return NextResponse.json({ error: 'This review link is invalid or has expired.' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('item_id, buyer_wallet, seller_wallet, status')
    .eq('id', v.order_id)
    .single();
  if (error || !order || order.buyer_wallet !== v.buyer_wallet) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  let product_name: string | null = null;
  try {
    const { data: item } = await supabase.from('items').select('name').eq('id', order.item_id).single();
    product_name = item?.name ?? null;
  } catch { /* optional */ }

  let existing: { rating: number; comment: string | null } | null = null;
  try {
    const { data: rev } = await supabase
      .from('reviews')
      .select('rating, comment')
      .eq('order_id', v.order_id)
      .eq('reviewer_wallet', v.buyer_wallet)
      .maybeSingle();
    existing = rev ?? null;
  } catch { /* reviews table optional pre-migration */ }

  return NextResponse.json({
    ok: true,
    order_id: v.order_id,
    buyer_wallet: v.buyer_wallet,
    item_id: order.item_id,
    seller_wallet: order.seller_wallet,
    status: order.status,
    product_name,
    existing,
  });
}
