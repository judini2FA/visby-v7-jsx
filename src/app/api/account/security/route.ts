import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/account/security?wallet=<solana address> — whether a Visby account password is set.
// Never returns the hash itself, only a boolean.
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet') ?? '';
  const ctx = await getAuthedContext(req);
  if (!ctx || !wallet || !ctx.wallets.includes(wallet)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = await rateLimit(`acct-sec-get:${wallet}`, { limit: 30, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('account_security')
    .select('password_hash')
    .eq('wallet', wallet)
    .maybeSingle();

  return NextResponse.json({ hasPassword: !!data?.password_hash });
}
