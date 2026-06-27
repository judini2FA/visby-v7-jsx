export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createInquiry, personaConfigured } from '@/lib/persona';
import { setKycStatus, type AccountType } from '@/lib/kyc';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

// Start an identity-verification inquiry for the caller and return a one-time link to open. The webhook
// (/api/kyc/webhook) is the canonical result — this only marks them 'pending'. No-op (503) until Persona
// is configured, so the flow is dormant during rollout.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`kyc-start:${ctx.userId}`, { limit: 6, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  if (!personaConfigured()) return NextResponse.json({ error: 'kyc_not_configured' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const accountType: AccountType = body?.account_type === 'business' ? 'business' : 'personal';
  const wallet = ctx.wallets[0];

  const inquiry = await createInquiry({ wallet, accountType });
  if (!inquiry) return NextResponse.json({ error: 'Could not start verification' }, { status: 502 });

  const supabase = createServiceClient();
  await supabase.from('kyc_verifications').insert({
    wallet,
    account_type: accountType,
    provider: 'persona',
    inquiry_id: inquiry.inquiryId,
    template_id: inquiry.templateId,
    status: 'created',
  });
  await setKycStatus(wallet, 'pending', { account_type: accountType });

  return NextResponse.json({ ok: true, url: inquiry.url });
}
