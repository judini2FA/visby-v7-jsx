import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { getWorstStatus } from '@/lib/account-status';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Client-side gate reads this to know whether the signed-in wallet is suspended/banned and why, so
// the UI can show a banner / block the sell flow without re-deriving moderation logic on the client.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ error: 'wallet is required' }, { status: 400 });

    // Only the wallet's own owner may read its moderation status — this can reveal a moderator's
    // reason text, which is not for public consumption.
    if (!(await callerOwnsWallet(req, wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`acct-status-get:${wallet}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const status = await getWorstStatus([wallet]);

    // moderation_reason lives on the profile row itself; read it directly rather than threading it
    // through getWorstStatus (which only needs to know the worst status across wallets).
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('moderation_reason')
      .eq('wallet', wallet)
      .maybeSingle();
    // Fail open on a read error (e.g. column not migrated yet) — same posture as account-status.ts —
    // so a transient/DB issue never blocks the client gate, it just won't have a reason to show.
    const reason = !error ? (data?.moderation_reason ?? null) : null;

    return NextResponse.json({ status, reason });
  } catch (err: any) {
    console.error('[account/status/GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
