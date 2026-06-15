import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('payout_settings')
    .select('*')
    .eq('seller_wallet', wallet)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function POST(req: Request) {
  try {
    const { seller_wallet, payout_type, stripe_account_id, crypto_wallet, crypto_chain } = await req.json();
    if (!seller_wallet || !payout_type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, seller_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (payout_type === 'bank'   && !stripe_account_id) return NextResponse.json({ error: 'Missing stripe_account_id' }, { status: 400 });
    if (payout_type === 'crypto' && !crypto_wallet)     return NextResponse.json({ error: 'Missing crypto_wallet' }, { status: 400 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('payout_settings')
      .upsert(
        { seller_wallet, payout_type, stripe_account_id: stripe_account_id ?? null, crypto_wallet: crypto_wallet ?? null, crypto_chain: crypto_chain ?? 'solana' },
        { onConflict: 'seller_wallet' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, settings: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
