import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet, getAuthedContext } from '@/lib/auth';
import { requireStepUp } from '@/lib/step-up';
import { payoutAction } from '@/lib/step-up-shared';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

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
    const { seller_wallet, payout_type, stripe_account_id, crypto_wallet, crypto_chain, payout_asset } = await req.json();
    if (!seller_wallet || !payout_type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.includes(seller_wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rl = await rateLimit(`payout:${seller_wallet}`, { limit: 10, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);
    const supabase = createServiceClient();

    // Bank payout preference: the seller no longer pastes a raw acct_ id — they complete Stripe Connect
    // onboarding (/api/connect/onboard), which records their connected account in seller_connect_accounts.
    // Resolve it here so the saved payout_settings row (read by /api/payout/test and the fiat gate in
    // releasePayout) always points at the real connected account. A pasted id is still honored as a fallback.
    let resolvedStripeAccountId: string | null = (typeof stripe_account_id === 'string' && stripe_account_id) ? stripe_account_id : null;
    if (payout_type === 'bank' && !resolvedStripeAccountId) {
      const { data: connect } = await supabase
        .from('seller_connect_accounts')
        .select('stripe_account_id')
        .eq('wallet', seller_wallet)
        .maybeSingle();
      resolvedStripeAccountId = connect?.stripe_account_id ?? null;
    }
    if (payout_type === 'bank'   && !resolvedStripeAccountId) return NextResponse.json({ error: 'Connect a bank account for payouts first.', code: 'no_connect_account' }, { status: 400 });
    if (payout_type === 'crypto' && !crypto_wallet)           return NextResponse.json({ error: 'Missing crypto_wallet' }, { status: 400 });

    // Step-up: changing where money is paid out is the classic account-takeover cash-out vector, so a
    // stolen session can't redirect future earnings without a fresh MFA-gated wallet signature. Dormant
    // until NEXT_PUBLIC_STEP_UP_ENFORCED=1 (then it also requires the owner to have MFA enrolled).
    // Bank binds to the constant 'connect' (one connected account per seller wallet, so nothing to
    // disambiguate) — the client can reproduce it without ever handling the raw acct_ id.
    const stepUp = await requireStepUp(req, seller_wallet, payoutAction(payout_type, payout_type === 'bank' ? 'connect' : crypto_wallet), ctx.userId);
    if (stepUp) return stepUp;

    const { data, error } = await supabase
      .from('payout_settings')
      .upsert(
        { seller_wallet, payout_type, stripe_account_id: resolvedStripeAccountId, crypto_wallet: crypto_wallet ?? null, crypto_chain: crypto_chain ?? 'solana', payout_asset: payout_asset === 'USDC' ? 'USDC' : 'SOL' },
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
