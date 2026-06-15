import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

// Buyer confirms receipt of the physical item. This releases the seller's payout
// (payout_released = true). Only the order's buyer can confirm, and only once.
export async function POST(req: Request) {
  try {
    const { order_id, buyer_wallet } = await req.json();
    if (!order_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString(), payout_released: true })
      .eq('id', order_id)
      .eq('buyer_wallet', buyer_wallet)
      .in('status', ['paid', 'shipped'])
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: 'Order not found or already finalized' }, { status: 409 });
    return NextResponse.json({ ok: true, order: data });
  } catch (err) {
    console.error('[orders/confirm] error:', err);
    return NextResponse.json({ error: 'Could not confirm delivery' }, { status: 500 });
  }
}
