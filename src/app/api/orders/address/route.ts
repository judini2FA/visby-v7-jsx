import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

// Buyer sets/updates the shipping address on their order.
export async function POST(req: Request) {
  try {
    const { order_id, buyer_wallet, ship_name, ship_address } = await req.json();
    if (!order_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('orders')
      .update({ ship_name: ship_name ?? null, ship_address: ship_address ?? null })
      .eq('id', order_id)
      .eq('buyer_wallet', buyer_wallet)
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: 'Order not found' }, { status: 409 });
    return NextResponse.json({ ok: true, order: data });
  } catch (err) {
    console.error('[orders/address] error:', err);
    return NextResponse.json({ error: 'Could not save address' }, { status: 500 });
  }
}
