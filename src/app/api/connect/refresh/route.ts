export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { refreshConnectStatus } from '@/lib/stripe-connect';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

// Force a fresh pull of the seller's Connect account state from Stripe (the source of truth) and
// persist it. Called from the /profile?connect=return landing after onboarding, since this build
// refreshes status on-demand rather than via Connect webhooks.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const wallet = typeof body?.wallet === 'string' ? body.wallet : null;
  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`connect-refresh:${wallet}`, { limit: 20, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const res = await refreshConnectStatus(wallet);
  if (!res.ok || !res.account) return NextResponse.json({ error: res.error ?? 'Could not refresh status' }, { status: 502 });

  const a = res.account;
  return NextResponse.json({
    onboarded: !!a.stripe_account_id,
    payouts_enabled: a.payouts_enabled,
    charges_enabled: a.charges_enabled,
    details_submitted: a.details_submitted,
  });
}
