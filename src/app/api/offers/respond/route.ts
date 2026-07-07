import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { isBanned } from '@/lib/account-status';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { respondToOffer, withdrawOffer } from '@/lib/offers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Seller accepts/declines an incoming offer, or a buyer withdraws their own (blueprint 7.3). Ownership is
// verified inside offers.ts against the caller's AUTHENTICATED wallets (accept/decline require the offer's
// seller_wallet; withdraw requires its buyer_wallet). Accept re-checks the item is still listed + CASes on
// the pending status.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const offer_id = typeof body?.offer_id === 'string' ? body.offer_id : '';
  const action = body?.action;
  if (!offer_id) return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });

  const rl = await rateLimit(`offer-respond:${ctx.wallets[0]}`, { limit: 40, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  if (action === 'accept' || action === 'decline') {
    // Accepting is a selling action — a banned/deleted account can't take a sale.
    if (await isBanned(ctx.wallets)) return NextResponse.json({ error: 'account_banned' }, { status: 403 });
    const r = await respondToOffer(offer_id, ctx.wallets, action);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, status: r.status });
  }

  if (action === 'withdraw') {
    const r = await withdrawOffer(offer_id, ctx.wallets);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, status: 'withdrawn' });
  }

  return NextResponse.json({ error: 'action must be accept, decline, or withdraw' }, { status: 400 });
}
