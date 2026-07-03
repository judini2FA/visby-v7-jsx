import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { generateResetToken, RESET_TTL_MS } from '@/lib/account-password';
import { emailWallet } from '@/lib/email';
import { passwordResetEmail } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/account/password/reset/request — { wallet }. Always returns { ok: true } regardless of
// outcome so the response never leaks whether email delivery/config succeeded.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const wallet = typeof body?.wallet === 'string' ? body.wallet : '';

  const ctx = await getAuthedContext(req);
  if (!ctx || !wallet || !ctx.wallets.includes(wallet)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = await rateLimit(`pw-reset-req:${wallet}`, { limit: 3, windowSec: 300 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const { token, tokenHash } = generateResetToken();
  const now = Date.now();
  const supabase = createServiceClient();
  await supabase.from('account_security').upsert({
    wallet,
    reset_token_hash: tokenHash,
    reset_expires_at: new Date(now + RESET_TTL_MS).toISOString(),
    updated_at: new Date(now).toISOString(),
  });

  void emailWallet(wallet, passwordResetEmail({ code: token }));

  return NextResponse.json({ ok: true });
}
