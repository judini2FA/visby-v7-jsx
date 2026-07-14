export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { moovConfigured, findCardPaymentMethod, findWalletPaymentMethod, createMoovTransfer, listMoovCards } from '@/lib/moov';
import { fulfillPurchase } from '@/lib/fulfill';
import { createServiceClient } from '@/lib/supabase/service';
import { toCents } from '@/lib/fees';
import { resolveCheckoutPrice } from '@/lib/offers';
import { captureError } from '@/lib/monitoring';

// Best-effort: records the just-charged card as the buyer's new default for one-tap reuse next time.
// Fires after the charge has already succeeded and never throws into the response — a save-card hiccup
// must never undo or fail an already-completed purchase.
async function saveCardOnFile(supabase: ReturnType<typeof createServiceClient>, wallet: string, accountID: string, cardID: string) {
  try {
    const cards = await listMoovCards(accountID);
    const card = cards.find((c: any) => c?.cardID === cardID);
    await supabase.from('moov_cards').update({ is_default: false }).eq('wallet', wallet);
    await supabase.from('moov_cards').upsert(
      {
        wallet,
        moov_account_id: accountID,
        card_id: cardID,
        brand: card?.brand ?? null,
        last4: card?.lastFourCardNumber ?? null,
        exp: card?.expiration?.month && card?.expiration?.year ? `${card.expiration.month}/${card.expiration.year}` : null,
        is_default: true,
      },
      { onConflict: 'wallet,card_id' },
    );
  } catch (err) {
    captureError(err, { stage: 'moov save card on file', wallet });
  }
}

const PLATFORM_ACCOUNT_ID = process.env.MOOV_PLATFORM_ACCOUNT_ID;

// Charge a Moov-collected card and settle the sale. Buyer's card (their Moov account) → the Visby
// platform wallet, priced SERVER-SIDE (never trust a client amount); x-wait-for blocks for the settled
// status so the provenance NFT only transfers once the card actually clears. The shared fulfillPurchase
// then mints/transfers the NFT + records the order exactly like the Stripe rail (idempotent). The seller
// is paid from the platform wallet by the existing payout-on-delivery flow. Reachable only once Moov is
// the active card rail (moov configured + capabilities enabled).
export async function POST(req: Request) {
  if (!moovConfigured() || !PLATFORM_ACCOUNT_ID) return NextResponse.json({ error: 'moov_not_configured' }, { status: 503 });

  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // card_id is optional — a fresh Card-Link Drop submission passes it through so the just-linked card
  // can be saved on file; a one-tap saved-card charge passes it to pick that exact card off the account.
  const { account_id, item_id, buyer_wallet, card_id } = body as { account_id?: string; item_id?: string; buyer_wallet?: string; card_id?: string };
  if (!account_id || !item_id || !buyer_wallet) return NextResponse.json({ error: 'account_id, item_id, buyer_wallet required' }, { status: 400 });
  if (!ctx.wallets.includes(buyer_wallet)) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });

  const rl = await rateLimit(`moov-charge:${buyer_wallet}`, { limit: 8, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  try {
    const supabase = createServiceClient();
    const { data: item } = await supabase
      .from('items')
      .select('id, price_usdc, is_listed')
      .eq('id', item_id)
      .single();
    if (!item || !item.is_listed || item.price_usdc == null) {
      return NextResponse.json({ error: 'item_not_purchasable' }, { status: 409 });
    }

    // Offers (7.3): accepted-offer price for this authed buyer (ctx.wallets.includes above), else list.
    // One resolved value feeds BOTH the card charge amount and fulfillPurchase so they can't diverge.
    const { priceUsd } = await resolveCheckoutPrice(item, buyer_wallet);

    const sourcePM = await findCardPaymentMethod(account_id, card_id);
    if (!sourcePM) return NextResponse.json({ error: 'card_payment_method_not_found' }, { status: 400 });
    const destPM = await findWalletPaymentMethod(PLATFORM_ACCOUNT_ID);
    if (!destPM) return NextResponse.json({ error: 'platform_wallet_not_found' }, { status: 500 });

    const transfer = await createMoovTransfer({
      sourcePaymentMethodID: sourcePM,
      destinationPaymentMethodID: destPM,
      amountCents: toCents(priceUsd),
      description: `Visby order ${item.id}`,
      idempotencyKey: `moov-charge:${item.id}:${buyer_wallet}`,
      metadata: { item_id: item.id, buyer_wallet },
      waitForRailResponse: true,
    });

    if (['failed', 'canceled', 'reversed'].includes(transfer.status)) {
      return NextResponse.json({ error: 'charge_failed', status: transfer.status }, { status: 402 });
    }

    // Only settle (transfer the NFT + record the order) once the card has actually cleared. If the rail
    // is still pending, the buyer retries — the idempotency key + fulfillPurchase's guard make that safe.
    if (transfer.status === 'completed') {
      await fulfillPurchase(item.id, buyer_wallet, String(priceUsd), null, { pay_method: 'card' });
      // Awaited (not fire-and-forget) because a serverless function can be frozen right after it responds
      // — but saveCardOnFile's internal try/catch means a save-card hiccup can never fail this response
      // or the purchase that already completed above.
      if (card_id) await saveCardOnFile(supabase, buyer_wallet, account_id, card_id);
      return NextResponse.json({ ok: true, transfer_id: transfer.transferID, status: transfer.status });
    }

    return NextResponse.json({ ok: false, pending: true, transfer_id: transfer.transferID, status: transfer.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'moov_charge_failed' }, { status: 500 });
  }
}
