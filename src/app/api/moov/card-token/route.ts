export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { moovConfigured, createMoovAccount, issueCardToken } from '@/lib/moov';
import { createServiceClient } from '@/lib/supabase/service';

// Issues a short-lived, cards.write-scoped Moov token so the BROWSER can submit card data straight to
// Moov (raw PAN never touches our server — PCI-safe). If the caller passes a wallet that already has a
// saved card (moov_cards), reuses that Moov account so a second linked card lands on the same account
// instead of spawning a fresh anonymous one; otherwise provisions a new account as before. Rate-limited
// because an account-less call still creates a Moov account.
export async function POST(req: Request) {
  if (!moovConfigured()) return NextResponse.json({ error: 'moov_not_configured' }, { status: 503 });

  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`moov-card-token:${ctx.wallets[0]}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const body = await req.json().catch(() => ({}));
  const wallet = typeof body?.wallet === 'string' && ctx.wallets.includes(body.wallet) ? body.wallet : null;

  try {
    let accountID: string | null = null;
    if (wallet) {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('moov_cards')
        .select('moov_account_id')
        .eq('wallet', wallet)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      accountID = data?.moov_account_id ?? null;
    }
    if (!accountID) {
      const created = await createMoovAccount({ type: 'individual', name: { firstName: 'Visby', lastName: 'Buyer' } });
      accountID = created.accountID;
    }
    const token = await issueCardToken(accountID);
    return NextResponse.json({ accountID, token });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'moov_card_token_failed' }, { status: 500 });
  }
}
