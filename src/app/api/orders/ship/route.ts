import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

// Seller marks an order shipped with optional carrier + tracking. Only the order's seller,
// and only while it is still 'paid', can ship it.
export async function POST(req: Request) {
  try {
    const { order_id, seller_wallet, carrier, tracking_number } = await req.json();
    if (!order_id || !seller_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, seller_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        tracking_carrier: carrier ?? null,
        tracking_number: tracking_number ?? null,
        shipped_at: new Date().toISOString(),
      })
      .eq('id', order_id)
      .eq('seller_wallet', seller_wallet)
      .eq('status', 'paid')
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: 'Order not found or not shippable' }, { status: 409 });
    return NextResponse.json({ ok: true, order: data });
  } catch (err) {
    console.error('[orders/ship] error:', err);
    return NextResponse.json({ error: 'Could not mark shipped' }, { status: 500 });
  }
}
