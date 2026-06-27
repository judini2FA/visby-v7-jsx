import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet, getAuthedContext } from '@/lib/auth';
import { requireStepUp } from '@/lib/step-up';

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
    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.includes(seller_wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (payout_type === 'bank'   && !stripe_account_id) return NextResponse.json({ error: 'Missing stripe_account_id' }, { status: 400 });
    if (payout_type === 'crypto' && !crypto_wallet)     return NextResponse.json({ error: 'Missing crypto_wallet' }, { status: 400 });

    // Step-up: changing where money is paid out is the classic account-takeover cash-out vector, so a
    // stolen session can't redirect future earnings without a fresh MFA-gated wallet signature. Dormant
    // until NEXT_PUBLIC_STEP_UP_ENFORCED=1 (then it also requires the owner to have MFA enrolled).
    const stepUp = await requireStepUp(req, seller_wallet, 'payout_destination', ctx.userId);
    if (stepUp) return stepUp;

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
