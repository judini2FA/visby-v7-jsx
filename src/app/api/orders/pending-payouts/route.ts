import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Delivered orders whose seller payout never released (payout_released=false) — money owed but stuck in
// escrow after a failed transfer. Surfaced in the seller dashboard so they can trigger a retry. Authed: a
// seller sees only their own.
export async function GET(req: Request) {
  try {
    const wallet = new URL(req.url).searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ orders: [] });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('orders')
      .select('id, item_id, price_usdc, created_at')
      .eq('seller_wallet', wallet)
      .eq('status', 'delivered')
      .eq('payout_released', false)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ orders: [] }); // table/columns missing → nothing pending
    return NextResponse.json({ orders: data ?? [] });
  } catch {
    return NextResponse.json({ orders: [] });
  }
}
