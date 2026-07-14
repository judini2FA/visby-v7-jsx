export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getAuthedContext, callerOwnsWallet } from '@/lib/auth';
import { isBanned } from '@/lib/account-status';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { coinbaseCommerceConfigured, createCharge } from '@/lib/coinbase-commerce';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveCheckoutPrice } from '@/lib/offers';

// Coinbase Commerce hosted-charge creation (blueprint 12b B2b) — a SECOND crypto checkout rail alongside
// the native SOL/USDC/Li.Fi flow, for buyers who'd rather pay via Coinbase's own hosted page (any wallet/
// exchange, not just Solana). SERVER-PRICED exactly like every other rail (Stripe payment-intent, Moov
// charge, ACH payment-intent) — never trusts a client-supplied amount. Fulfillment happens later, async,
// in /api/coinbase/webhook on charge:confirmed (mirrors ACH's initiate-here/fulfill-in-webhook shape,
// since the buyer's on-chain payment can take a few minutes to confirm). Reachable only once
// COINBASE_COMMERCE_API_KEY is set — 503s otherwise; the checkout tab itself is separately gated behind
// NEXT_PUBLIC_COINBASE_ENABLED so this stays flag-dark end to end.
export async function POST(req: Request) {
  if (!coinbaseCommerceConfigured()) return NextResponse.json({ error: 'coinbase_not_configured' }, { status: 503 });

  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { item_id, buyer_wallet } = body as { item_id?: string; buyer_wallet?: string };
  if (!item_id || !buyer_wallet) return NextResponse.json({ error: 'item_id, buyer_wallet required' }, { status: 400 });

  // Auth: only the signed-in owner of buyer_wallet may check out as that wallet (offer pricing keys off
  // buyer_wallet, so an unauthed/mismatched caller could otherwise name a victim's wallet and mint a
  // charge in their name). Double-checked (ctx.wallets + callerOwnsWallet) to mirror the ACH rail exactly.
  if (!ctx.wallets.includes(buyer_wallet)) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });
  if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });

  // Ban-freeze: a banned account can't move money. Fails open on a DB error (never strands a legitimate
  // buyer). Mirrors the other money routes.
  if (await isBanned(ctx.wallets)) return NextResponse.json({ error: 'account_banned' }, { status: 403 });

  const rl = await rateLimit(`coinbase-charge:${buyer_wallet}`, { limit: 8, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  try {
    const supabase = createServiceClient();
    const { data: item } = await supabase
      .from('items')
      .select('id, name, price_usdc, is_listed, current_owner_wallet')
      .eq('id', item_id)
      .single();
    if (!item || !item.is_listed || item.price_usdc == null) {
      return NextResponse.json({ error: 'item_not_purchasable' }, { status: 409 });
    }
    if (item.current_owner_wallet === buyer_wallet) {
      return NextResponse.json({ error: 'You already own this item' }, { status: 400 });
    }

    // Offers (7.3): accepted-offer price for this authed buyer, else list — the SAME resolution every
    // rail shares, so the charge amount and the webhook's eventual fulfillPurchase amount can't diverge.
    const { priceUsd, offerId } = await resolveCheckoutPrice(item, buyer_wallet);

    const charge = await createCharge({
      name: item.name,
      description: `Visby order ${item.id}`,
      amountUsd: priceUsd,
      metadata: {
        item_id: item.id,
        buyer_wallet,
        price_usdc: String(priceUsd),
        ...(offerId ? { offer_id: offerId } : {}),
      },
    });

    return NextResponse.json({ ok: true, hosted_url: charge.hosted_url, charge_id: charge.id, charge_code: charge.code });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'coinbase_charge_failed' }, { status: 500 });
  }
}
