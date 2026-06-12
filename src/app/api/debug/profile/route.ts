import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  const url   = new URL(req.url);
  const wallet = url.searchParams.get('wallet') ?? '';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: allItems } = await supabase
    .from('items')
    .select('id, name, serial_number, current_owner_wallet, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: walletItems } = wallet ? await supabase
    .from('items')
    .select('id, name, serial_number, current_owner_wallet')
    .eq('current_owner_wallet', wallet) : { data: null };

  return NextResponse.json({ wallet_queried: wallet, wallet_items: walletItems ?? [], all_recent: allItems ?? [] });
}
