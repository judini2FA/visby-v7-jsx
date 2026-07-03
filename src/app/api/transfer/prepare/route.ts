export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { resolveRecipient, prepareAtomic, type TransferToken } from '@/lib/transfers';
import { requireStepUp } from '@/lib/step-up';
import { sendMoneyAction } from '@/lib/step-up-shared';
import { isBanned } from '@/lib/account-status';

const TOKENS: TransferToken[] = ['SOL', 'USDC'];

// Step 1 of a non-custodial send: resolve the recipient, enforce limits, and record a pending transfer
// (idempotency-keyed). The client then signs + sends the on-chain tx itself and calls /confirm. Visby
// never touches the funds — this only authorizes + ledgers the move.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`transfer-prepare:${ctx.userId}`, { limit: 20, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const body = await req.json().catch(() => ({}));
  const from_wallet = typeof body.from_wallet === 'string' ? body.from_wallet : '';
  const to = typeof body.to === 'string' ? body.to : '';
  const token = body.token as TransferToken;
  const amount = Number(body.amount);
  const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key : '';

  if (!from_wallet || !to || !idempotency_key) return NextResponse.json({ error: 'from_wallet, to, idempotency_key are required' }, { status: 400 });
  if (!TOKENS.includes(token)) return NextResponse.json({ error: 'token must be SOL or USDC' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  // Reject sub-dust: SOL amounts that round to 0 lamports would record a "sent" transfer that moved nothing.
  if (token === 'SOL' && Math.round(amount * 1e9) < 1) return NextResponse.json({ error: 'amount is too small' }, { status: 400 });
  if (!ctx.wallets.includes(from_wallet)) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });

  // Ban-freeze: only a BAN locks a user out of moving their own money — suspension only blocks selling.
  // isBanned reads the worst account_status across all of the caller's linked wallets and fails open on
  // a DB error so an outage never freezes a legitimate user's funds.
  if (await isBanned(ctx.wallets)) return NextResponse.json({ error: 'account_banned' }, { status: 403 });

  // MFA step-up before authorizing a send (money leaving the user's wallet). Binds the destination +
  // token; dormant until NEXT_PUBLIC_STEP_UP_ENFORCED=1, then also requires the owner to have MFA enrolled.
  const stepUp = await requireStepUp(req, from_wallet, sendMoneyAction(to, token), ctx.userId);
  if (stepUp) return stepUp;

  const recipient = await resolveRecipient(to);
  if (!recipient) return NextResponse.json({ error: 'recipient_not_found' }, { status: 404 });
  if (recipient.wallet === from_wallet) return NextResponse.json({ error: 'Source and destination are the same wallet' }, { status: 400 });

  // Cap check + pending record in one atomic step (see prepareAtomic) — concurrent prepares can't
  // race past the daily limit.
  const kind = ctx.wallets.includes(recipient.wallet) ? 'self' : 'p2p';
  const rec = await prepareAtomic({
    idempotency_key, from_wallet, to_wallet: recipient.wallet, to_handle: recipient.handle,
    token, amount, kind,
  });
  if (!rec) return NextResponse.json({ error: 'Could not prepare transfer' }, { status: 500 });
  if (!rec.ok) return NextResponse.json({ error: 'limit_exceeded', reason: rec.reason }, { status: 403 });

  return NextResponse.json({
    ok: true, transfer_id: rec.id, kind,
    to_wallet: recipient.wallet, display_name: recipient.display_name, avatar_url: recipient.avatar_url, handle: recipient.handle,
    token, amount,
  });
}
