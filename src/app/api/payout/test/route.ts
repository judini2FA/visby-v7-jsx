import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Test-mode seller payout. This is the real production primitive: a Connect transfer from the
// platform balance to the seller's connected account. We first top up the platform's available
// test balance with the bypass-pending test token so the transfer always clears, then transfer.
//
// Prerequisite: Connect must be enabled (dashboard.stripe.com/connect) and the seller's
// stripe_account_id must be a real connected account (acct_…). If Connect isn't enabled yet,
// Stripe's error is surfaced verbatim so the fix is obvious.
export async function POST(req: Request) {
  try {
    const { seller_wallet } = await req.json();
    if (!seller_wallet) return NextResponse.json({ error: 'Missing seller_wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, seller_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: settings } = await supabase
      .from('payout_settings')
      .select('*')
      .eq('seller_wallet', seller_wallet)
      .maybeSingle();

    if (!settings || settings.payout_type !== 'bank' || !settings.stripe_account_id) {
      return NextResponse.json({ error: 'Save a bank (Stripe Connect) payout method first.' }, { status: 400 });
    }

    const account = await stripe.accounts.retrieve(settings.stripe_account_id);
    if (!account.payouts_enabled) {
      return NextResponse.json(
        { error: 'Stripe account not verified for payouts — complete Connect onboarding first.' },
        { status: 400 },
      );
    }

    const amount = 100; // $1.00

    // tok_bypassPending adds directly to available balance in test mode so the transfer can clear.
    const topup = await stripe.topups.create({
      amount, currency: 'usd', source: 'tok_bypassPending',
      description: 'Visby test payout funding',
    });

    let transfer: Stripe.Transfer;
    try {
      transfer = await stripe.transfers.create({
        amount, currency: 'usd',
        destination: settings.stripe_account_id,
        description: 'Visby simulated seller payout',
        metadata: { seller_wallet },
      });
    } catch (transferErr) {
      await stripe.topups.cancel(topup.id).catch(() => {});
      throw transferErr;
    }

    return NextResponse.json({ ok: true, payout_id: transfer.id, amount, status: 'paid' });
  } catch (err) {
    console.error('[payout/test]', err);
    return NextResponse.json({ error: 'Test payout failed' }, { status: 500 });
  }
}
