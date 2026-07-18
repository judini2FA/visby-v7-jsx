import { createServiceClient } from '@/lib/supabase/service';
import { captureError } from '@/lib/monitoring';

// Offers (blueprint 7.3). A buyer proposes a below-list price on a listed item; the seller accepts; the
// accepted, unexpired offer lets THAT buyer check out at that price. See migration_offers.sql.
//
// The money boundary is getAcceptedOfferPrice(), called by the checkout rails with the AUTHENTICATED
// buyer wallet + the item's list price. It: (1) only honors an 'accepted', unexpired offer for exactly
// that (item, buyer); (2) re-clamps to <= list so an offer can never RAISE the price; (3) fails SOFT
// toward the list price on any error — a lookup failure yields NO discount, never an unauthorized one.

export const OFFER_ACCEPT_TTL_MS = 48 * 60 * 60 * 1000; // an accepted offer is good for 48h
const MIN_OFFER_USD = 1;

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'consumed' | 'withdrawn';
export type Offer = {
  id: string;
  item_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  amount_usd: number;
  status: OfferStatus;
  created_at: string;
  accepted_at: string | null;
  expires_at: string | null;
};

type MakeResult = { ok: true; offer: Offer } | { ok: false; error: string };

// Buyer proposes a price. Validates item listed + buyer isn't the owner + amount in [MIN, list].
// Replaces any prior live offer from this buyer on this item so a buyer holds at most one live offer.
export async function makeOffer(itemId: string, buyerWallet: string, amountUsd: number): Promise<MakeResult> {
  if (!itemId || !buyerWallet) return { ok: false, error: 'missing_fields' };
  if (!Number.isFinite(amountUsd) || amountUsd < MIN_OFFER_USD) return { ok: false, error: 'invalid_amount' };

  const supabase = createServiceClient();
  const { data: item } = await supabase
    .from('items')
    .select('id, current_owner_wallet, is_listed, price_usdc')
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: 'item_not_found' };
  if (!item.is_listed || item.price_usdc == null) return { ok: false, error: 'not_listed' };
  if (item.current_owner_wallet === buyerWallet) return { ok: false, error: 'own_item' };
  if (amountUsd > Number(item.price_usdc)) return { ok: false, error: 'above_list_price' };

  // Offers are personal-user-only (Judah's rule): a business seller can only be Bought Now, never
  // offered on. Re-checked here (not just hidden in the UI) so it can't be bypassed via a direct API call.
  const { data: sellerProfile } = await supabase
    .from('profiles')
    .select('account_type')
    .eq('wallet', item.current_owner_wallet)
    .maybeSingle();
  if (sellerProfile?.account_type === 'business') return { ok: false, error: 'seller_is_business' };

  // Withdraw any existing live offer from this buyer on this item, then insert the fresh pending one.
  await supabase
    .from('offers')
    .update({ status: 'withdrawn', resolved_at: new Date().toISOString() })
    .eq('item_id', itemId)
    .eq('buyer_wallet', buyerWallet)
    .in('status', ['pending', 'accepted']);

  const { data: offer, error } = await supabase
    .from('offers')
    .insert({
      item_id: itemId,
      buyer_wallet: buyerWallet,
      seller_wallet: item.current_owner_wallet,
      amount_usd: amountUsd,
      status: 'pending',
    })
    .select()
    .single();
  if (error || !offer) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, offer: offer as Offer };
}

// Seller accepts or declines. sellerWallets = the responder's AUTHENTICATED wallets; the offer's
// seller_wallet must be among them (only the item's seller can respond). Accept re-checks the item is
// still listed + owned by the seller (can't accept a sale that already happened) and CASes on the pending
// status so two concurrent responses can't both win.
export async function respondToOffer(
  offerId: string,
  sellerWallets: string[],
  action: 'accept' | 'decline',
): Promise<{ ok: boolean; error?: string; status?: OfferStatus }> {
  if (!offerId || !sellerWallets?.length) return { ok: false, error: 'missing_fields' };
  const supabase = createServiceClient();

  const { data: offer } = await supabase
    .from('offers')
    .select('id, seller_wallet, item_id, buyer_wallet, status')
    .eq('id', offerId)
    .maybeSingle();
  if (!offer) return { ok: false, error: 'offer_not_found' };
  if (!sellerWallets.includes(offer.seller_wallet)) return { ok: false, error: 'not_your_offer' };
  if (offer.status !== 'pending') return { ok: false, error: 'not_pending' };

  const now = new Date().toISOString();

  if (action === 'decline') {
    const { error } = await supabase
      .from('offers')
      .update({ status: 'declined', resolved_at: now })
      .eq('id', offerId)
      .eq('status', 'pending');
    return error ? { ok: false, error: error.message } : { ok: true, status: 'declined' };
  }

  // accept — the item must still be listed AND owned by the seller.
  const { data: item } = await supabase
    .from('items')
    .select('is_listed, current_owner_wallet')
    .eq('id', offer.item_id)
    .maybeSingle();
  if (!item || !item.is_listed || item.current_owner_wallet !== offer.seller_wallet) {
    return { ok: false, error: 'item_unavailable' };
  }
  const { error } = await supabase
    .from('offers')
    .update({
      status: 'accepted',
      accepted_at: now,
      expires_at: new Date(Date.now() + OFFER_ACCEPT_TTL_MS).toISOString(),
    })
    .eq('id', offerId)
    .eq('status', 'pending'); // CAS: only the first responder flips it
  return error ? { ok: false, error: error.message } : { ok: true, status: 'accepted' };
}

// Buyer withdraws their own live offer.
export async function withdrawOffer(offerId: string, buyerWallets: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!offerId || !buyerWallets?.length) return { ok: false, error: 'missing_fields' };
  const supabase = createServiceClient();
  const { data: offer } = await supabase.from('offers').select('id, buyer_wallet, status').eq('id', offerId).maybeSingle();
  if (!offer) return { ok: false, error: 'offer_not_found' };
  if (!buyerWallets.includes(offer.buyer_wallet)) return { ok: false, error: 'not_your_offer' };
  if (offer.status !== 'pending' && offer.status !== 'accepted') return { ok: false, error: 'not_live' };
  const { error } = await supabase
    .from('offers')
    .update({ status: 'withdrawn', resolved_at: new Date().toISOString() })
    .eq('id', offerId)
    .in('status', ['pending', 'accepted']);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// MONEY BOUNDARY — the checkout rails call this with the AUTHENTICATED buyer wallet. Returns the honored
// price (offer amount, clamped <= list) + offer id, or null (charge the list price). Fails SOFT to null.
export async function getAcceptedOfferPrice(
  itemId: string,
  buyerWallet: string,
  listPriceUsd: number,
): Promise<{ amountUsd: number; offerId: string } | null> {
  try {
    if (!itemId || !buyerWallet || !Number.isFinite(listPriceUsd)) return null;
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('offers')
      .select('id, amount_usd, expires_at')
      .eq('item_id', itemId)
      .eq('buyer_wallet', buyerWallet)
      .eq('status', 'accepted')
      .maybeSingle();
    if (error || !data) return null;
    // Require a present AND future expiry — an accepted offer always carries one (set atomically in
    // respondToOffer), so a missing expires_at is anomalous; treat it as no discount rather than unbounded.
    if (!data.expires_at || new Date(data.expires_at).getTime() < Date.now()) return null;
    const amt = Number(data.amount_usd);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    if (!(listPriceUsd > 0)) return null;   // a non-positive list price is corrupt — never grant a discount off it
    if (amt > listPriceUsd) return null;     // an offer can NEVER raise the price
    return { amountUsd: amt, offerId: data.id };
  } catch (err) {
    captureError(err, { stage: 'getAcceptedOfferPrice', item_id: itemId });
    return null; // fail-soft toward the list price — never grant an unauthorized discount on error
  }
}

// Convenience for the checkout rails: given the item row + the AUTHENTICATED buyer wallet, return the
// effective checkout price (accepted-offer amount if one applies, else the list price) + the offer id.
// Every rail resolves the price the same way through this, so the offer discount is applied identically
// (and safely — see getAcceptedOfferPrice) everywhere. Falls back to the list price on any miss/error.
export async function resolveCheckoutPrice(
  item: { id: string; price_usdc: number | string | null },
  buyerWallet: string,
): Promise<{ priceUsd: number; offerId: string | null }> {
  const list = Number(item?.price_usdc ?? 0);
  if (!item?.id || !buyerWallet || !Number.isFinite(list) || list <= 0) return { priceUsd: list, offerId: null };
  const offer = await getAcceptedOfferPrice(item.id, buyerWallet, list);
  return offer ? { priceUsd: offer.amountUsd, offerId: offer.offerId } : { priceUsd: list, offerId: null };
}

// Mark the accepted offer consumed once the purchase completes. Best-effort: the item selling once
// (is_listed→false + owner transfer) is the real single-use guard, so a missed consume never enables reuse.
export async function consumeOffer(itemId: string, buyerWallet: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase
      .from('offers')
      .update({ status: 'consumed', resolved_at: new Date().toISOString() })
      .eq('item_id', itemId)
      .eq('buyer_wallet', buyerWallet)
      .eq('status', 'accepted');
  } catch (err) {
    captureError(err, { stage: 'consumeOffer', item_id: itemId });
  }
}

// Seller's incoming offers (pending first) and a buyer's own offers — for the UI.
export async function listSellerOffers(sellerWallets: string[]): Promise<Offer[]> {
  if (!sellerWallets?.length) return [];
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('offers')
      .select('id, item_id, buyer_wallet, seller_wallet, amount_usd, status, created_at, accepted_at, expires_at')
      .in('seller_wallet', sellerWallets)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(200);
    return (data ?? []) as Offer[];
  } catch {
    return [];
  }
}

export async function listBuyerOffers(buyerWallets: string[]): Promise<Offer[]> {
  if (!buyerWallets?.length) return [];
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('offers')
      .select('id, item_id, buyer_wallet, seller_wallet, amount_usd, status, created_at, accepted_at, expires_at')
      .in('buyer_wallet', buyerWallets)
      .order('created_at', { ascending: false })
      .limit(200);
    return (data ?? []) as Offer[];
  } catch {
    return [];
  }
}
