import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { passwordProblem, hashPassword, resetTokenMatches } from '@/lib/account-password';
import { emailWallet } from '@/lib/email';
import { securityAlert } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/account/password/reset/confirm — { wallet, token, new_password }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const wallet = typeof body?.wallet === 'string' ? body.wallet : '';
  const token = body?.token;
  const newPassword = body?.new_password;

  const ctx = await getAuthedContext(req);
  if (!ctx || !wallet || !ctx.wallets.includes(wallet)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = await rateLimit(`pw-reset-confirm:${wallet}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'bad_or_expired_token' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('account_security')
    .select('reset_token_hash, reset_expires_at')
    .eq('wallet', wallet)
    .maybeSingle();

  const notExpired = !!data?.reset_expires_at && new Date(data.reset_expires_at).getTime() > Date.now();
  if (!notExpired || !resetTokenMatches(token, data?.reset_token_hash ?? null)) {
    return NextResponse.json({ error: 'bad_or_expired_token' }, { status: 400 });
  }

  const problem = passwordProblem(newPassword);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const password_hash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  const { error } = await supabase.from('account_security').upsert({
    wallet,
    password_hash,
    password_set_at: now,
    reset_token_hash: null,
    reset_expires_at: null,
    updated_at: now,
  });
  if (error) return NextResponse.json({ error: 'Failed to save password' }, { status: 500 });

  void emailWallet(wallet, securityAlert({ label: 'Account password reset', when: now }));

  return NextResponse.json({ ok: true });
}
