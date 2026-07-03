import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { passwordProblem, hashPassword, verifyPassword } from '@/lib/account-password';
import { emailWallet } from '@/lib/email';
import { securityAlert } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/account/password/set — { wallet, new_password, current_password? }
// Sets the Visby account password. If one already exists, current_password must verify first.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const wallet = typeof body?.wallet === 'string' ? body.wallet : '';
  const newPassword = body?.new_password;
  const currentPassword = body?.current_password;

  const ctx = await getAuthedContext(req);
  if (!ctx || !wallet || !ctx.wallets.includes(wallet)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = await rateLimit(`pw-set:${wallet}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('account_security')
    .select('password_hash')
    .eq('wallet', wallet)
    .maybeSingle();

  if (existing?.password_hash) {
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return NextResponse.json({ error: 'current_password required' }, { status: 400 });
    }
    const ok = await verifyPassword(currentPassword, existing.password_hash);
    if (!ok) return NextResponse.json({ error: 'wrong_password' }, { status: 401 });
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

  // security_audit_log's SecurityEvent union doesn't include password events and is out of scope for
  // this change (touch-only constraint) — send the alert email directly instead of via logSecurityEvent.
  void emailWallet(wallet, securityAlert({ label: existing?.password_hash ? 'Account password changed' : 'Account password set', when: now }));

  return NextResponse.json({ ok: true });
}
