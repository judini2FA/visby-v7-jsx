export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { isBanned } from '@/lib/account-status';
import { confirmTransfer } from '@/lib/transfers';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

// Step 2: the client reports the on-chain tx hash it just signed + sent. We verify it on-chain and mark
// the prepared transfer 'sent'. Idempotent — re-confirming an already-sent transfer is a no-op success.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const transfer_id = typeof body.transfer_id === 'string' ? body.transfer_id : '';
  const from_wallet = typeof body.from_wallet === 'string' ? body.from_wallet : '';
  const tx_hash = typeof body.tx_hash === 'string' ? body.tx_hash : '';

  if (!transfer_id || !from_wallet || !tx_hash) return NextResponse.json({ error: 'transfer_id, from_wallet, tx_hash are required' }, { status: 400 });
  if (!ctx.wallets.includes(from_wallet)) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });
  // Ban/deleted accounts are locked out of the whole send flow — prepare already gates this; mirror it here.
  if (await isBanned(ctx.wallets)) return NextResponse.json({ error: 'account_banned' }, { status: 403 });

  const rl = await rateLimit(`transfer-confirm:${from_wallet}`, { limit: 30, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const r = await confirmTransfer({ id: transfer_id, from_wallet, tx_hash });
  return NextResponse.json({ ok: r.ok, status: r.status });
}
