import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createIdentitySession } from '@/lib/stripe-identity';
import { setKycStatus, type AccountType } from '@/lib/kyc';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Start a Stripe Identity verification for the caller and return the Stripe-hosted URL to open. The
// webhook (/api/kyc/webhook) is the canonical result — this only marks them 'pending'. Degrades to 503
// when Identity isn't enabled on the Stripe account yet, so the flow is dormant during rollout.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`kyc-start:${ctx.userId}`, { limit: 6, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const body = await req.json().catch(() => ({}));
  const accountType: AccountType = body?.account_type === 'business' ? 'business' : 'personal';
  const wallet = ctx.wallets[0];

  const origin = req.headers.get('origin') || new URL(req.url).origin;
  const session = await createIdentitySession({ wallet, accountType, returnUrl: `${origin}/profile?kyc=done` });
  if (!session) return NextResponse.json({ error: 'kyc_not_configured' }, { status: 503 });

  const supabase = createServiceClient();
  await supabase.from('kyc_verifications').insert({
    wallet,
    account_type: accountType,
    provider: 'stripe_identity',
    inquiry_id: session.sessionId,
    status: 'created',
  });
  await setKycStatus(wallet, 'pending', { account_type: accountType });

  return NextResponse.json({ ok: true, url: session.url });
}
