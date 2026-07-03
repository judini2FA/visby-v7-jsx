import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { verifyPassword } from '@/lib/account-password';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/account/password/verify — { wallet, password }. Hard rate-limited (brute-force target).
// Returns { ok: false } for both "wrong password" and "no password set" — never distinguish.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const wallet = typeof body?.wallet === 'string' ? body.wallet : '';
  const password = body?.password;

  const ctx = await getAuthedContext(req);
  if (!ctx || !wallet || !ctx.wallets.includes(wallet)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = await rateLimit(`pw-verify:${wallet}`, { limit: 5, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ ok: false });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('account_security')
    .select('password_hash')
    .eq('wallet', wallet)
    .maybeSingle();

  const ok = await verifyPassword(password, data?.password_hash ?? null);
  return NextResponse.json({ ok });
}
