export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { moovConfigured, createMoovAccount, issueCardToken } from '@/lib/moov';

// Issues a short-lived, cards.write-scoped Moov token so the BROWSER can submit card data straight to
// Moov (raw PAN never touches our server — PCI-safe). Provisions a buyer Moov account for this checkout
// and returns its id + the token. Rate-limited because each call creates a Moov account.
export async function POST(req: Request) {
  if (!moovConfigured()) return NextResponse.json({ error: 'moov_not_configured' }, { status: 503 });

  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`moov-card-token:${ctx.wallets[0]}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  try {
    const { accountID } = await createMoovAccount({ type: 'individual', name: { firstName: 'Visby', lastName: 'Buyer' } });
    const token = await issueCardToken(accountID);
    return NextResponse.json({ accountID, token });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'moov_card_token_failed' }, { status: 500 });
  }
}
