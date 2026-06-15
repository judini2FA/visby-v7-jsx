import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Orders for the authenticated wallet, as buyer (default) or seller. Contains shipping PII,
// so it is gated to the wallet owner.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    const role   = searchParams.get('role') === 'seller' ? 'seller' : 'buyer';
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const column = role === 'seller' ? 'seller_wallet' : 'buyer_wallet';
    const { data, error } = await supabase
      .from('orders')
      .select('*, items(id, name, category, condition, serial_number, image_url, nft_mint_address)')
      .eq(column, wallet)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ orders: [] });   // table missing → empty, non-fatal
    return NextResponse.json({ orders: data ?? [] });
  } catch (err) {
    console.error('[orders] list error:', err);
    return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
  }
}
