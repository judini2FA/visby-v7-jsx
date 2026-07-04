export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createOnboardingLink } from '@/lib/stripe-connect';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

// Start (or resume) Stripe Connect Express onboarding for the caller's own wallet. Returns a
// one-time hosted onboarding URL to redirect the seller to — mirrors /api/kyc/start's shape.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const wallet = typeof body?.wallet === 'string' ? body.wallet : ctx.wallets[0];
  if (!ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`connect-onboard:${wallet}`, { limit: 10, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const origin = req.headers.get('origin') || new URL(req.url).origin;
  const returnUrl = typeof body?.returnUrl === 'string' && body.returnUrl ? body.returnUrl : `${origin}/profile?connect=return`;
  const refreshUrl = `${origin}/profile?connect=refresh`;

  const link = await createOnboardingLink(wallet, returnUrl, refreshUrl);
  if (!link.ok || !link.url) return NextResponse.json({ error: link.error ?? 'Could not start onboarding' }, { status: 502 });

  return NextResponse.json({ url: link.url });
}
