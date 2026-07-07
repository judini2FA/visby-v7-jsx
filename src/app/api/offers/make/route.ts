import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { isBanned } from '@/lib/account-status';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { makeOffer } from '@/lib/offers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A buyer proposes a below-list price on a listed item (blueprint 7.3). Authed to the buyer's own wallet;
// validation + the "at most one live offer per item" rule live in makeOffer.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const item_id = typeof body?.item_id === 'string' ? body.item_id : '';
  const buyer_wallet = typeof body?.buyer_wallet === 'string' ? body.buyer_wallet : '';
  const amount_usd = Number(body?.amount_usd);

  if (!ctx.wallets.includes(buyer_wallet)) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });
  if (await isBanned(ctx.wallets)) return NextResponse.json({ error: 'account_banned' }, { status: 403 });

  const rl = await rateLimit(`offer-make:${buyer_wallet}`, { limit: 20, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const r = await makeOffer(item_id, buyer_wallet, amount_usd);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, offer: r.offer });
}
