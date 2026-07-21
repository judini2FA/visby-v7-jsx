import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority } from '@/lib/nft';
import { createOrder } from '@/lib/orders';

// Shared post-payment settlement: transfer the item's provenance NFT from the mint authority to the
// buyer, flip ownership, record history, and create the fulfillment order. ONE source of truth for
// every paid rail (Stripe card, Moov card, …) so the money path never diverges. Idempotent — a repeat
// call for an item the buyer already owns is a no-op, so both a synchronous confirm and a webhook can
// call it without double-settling.
export async function fulfillPurchase(
  item_id: string,
  buyer_wallet: string,
  price_usdc: string | undefined,
  payment_intent_id?: string | null,
  opts?: { pay_method?: string; sale_channel?: string },
): Promise<void> {
  const supabase = createServiceClient();

  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('id', item_id)
    .single();

  if (!item) {
    throw new Error(`Item ${item_id} not found`);
  }

  // Idempotency guard — already transferred
  if (item.current_owner_wallet === buyer_wallet) {
    return;
  }

  if (!item.is_listed) {
    throw new Error(`Item ${item_id} is no longer listed`);
  }

  const previousOwner = item.current_owner_wallet;

  // Tight retry budget: this asset was minted at listing time and is already indexed, so the long
  // read-after-write fetch loop is never needed here. Bounding it keeps this call (invoked inline from
  // the Stripe webhook) from hanging into Stripe's delivery timeout under RPC stress — a timeout is the
  // "no response" failure that, accumulated over days, auto-disables the webhook endpoint. On failure we
  // throw, so the webhook returns 5xx and Stripe re-delivers (a clean retry, not a silent timeout).
  const txRef = await transferFromAuthority(item.nft_mint_address, buyer_wallet, { fetchAttempts: 3, fetchDelayMs: 800 });

  await supabase
    .from('items')
    .update({ current_owner_wallet: buyer_wallet, is_listed: false, price_usdc: null, listed_at: null })
    .eq('id', item_id);

  await supabase.from('ownership_history').insert({
    item_id,
    owner_wallet: buyer_wallet,
    from_wallet:  previousOwner,
    tx_hash:      txRef,
    event_type:   'transfer',
    price_usdc:   price_usdc ? parseFloat(price_usdc) : item.price_usdc,
  });

  await createOrder({
    item_id, buyer_wallet, seller_wallet: previousOwner,
    price_usdc: price_usdc ? parseFloat(price_usdc) : item.price_usdc,
    pay_method: opts?.pay_method ?? 'card', nft_tx: txRef,
    sale_channel: opts?.sale_channel,
    stripe_payment_intent: payment_intent_id ?? null,
  });
}
