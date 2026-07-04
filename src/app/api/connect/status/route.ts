export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { getConnectStatus } from '@/lib/stripe-connect';

// Read-only status check — cheap (no Stripe call, just the persisted row). Use POST /api/connect/refresh
// to force a fresh pull from Stripe.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const account = await getConnectStatus(wallet);
  if (!account) return NextResponse.json({ onboarded: false, payouts_enabled: false, charges_enabled: false, details_submitted: false });

  return NextResponse.json({
    onboarded: !!account.stripe_account_id,
    payouts_enabled: account.payouts_enabled,
    charges_enabled: account.charges_enabled,
    details_submitted: account.details_submitted,
  });
}
