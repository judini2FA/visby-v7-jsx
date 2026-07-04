import { createServiceClient } from '@/lib/supabase/service';

// Blueprint 4.4 — durable single-flight for ACH bank-debit pay-ins. An ACH PaymentIntent sits in
// `processing` for 1–3 business days; Stripe's idempotencyKey only dedupes for 24h. These helpers back
// the ach_payins table (partial unique index on (item_id, buyer_wallet) where status='processing') so a
// buyer can never have two in-flight ACH debits for the same item across the settlement window.

// Atomically claim the single in-flight slot for (item, buyer). Returns { ok, claimId } to the winner;
// { inFlight:true } if a processing ACH already exists for this pair. Self-heals only genuine ORPHAN
// claims — rows whose PaymentIntent was never attached (a crash between claim and attach) — so they
// can't block a legitimate retry forever. The `payment_intent_id IS NULL` filter is CRITICAL: a live,
// attached claim represents a real in-flight bank debit and must NEVER be reclaimed by a re-submit
// (ACH can still be clearing past expiry across weekends / NSF-return windows) — it only leaves
// 'processing' via the webhook. Deleting an attached claim here would let a re-submit fire a second
// real debit.
export async function claimAchPayin(
  itemId: string,
  buyerWallet: string,
): Promise<{ ok: boolean; claimId?: string; inFlight?: boolean; error?: string }> {
  const supabase = createServiceClient();

  await supabase
    .from('ach_payins')
    .delete()
    .eq('item_id', itemId)
    .eq('buyer_wallet', buyerWallet)
    .eq('status', 'processing')
    .is('payment_intent_id', null)
    .lt('expires_at', new Date().toISOString());

  const { data, error } = await supabase
    .from('ach_payins')
    .insert({ item_id: itemId, buyer_wallet: buyerWallet, status: 'processing' })
    .select('id')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') return { ok: false, inFlight: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, claimId: data.id };
}

// Bind the created PaymentIntent to the claim once it exists.
export async function attachAchPayinPi(claimId: string, paymentIntentId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('ach_payins').update({ payment_intent_id: paymentIntentId }).eq('id', claimId);
}

// Release the claim when the PaymentIntent could not be created — frees the slot for an immediate retry.
export async function releaseAchPayin(claimId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('ach_payins').delete().eq('id', claimId);
}

// Terminal-state the claim by PI id (from the webhook). 'failed' frees the slot so the buyer can retry;
// 'succeeded'/'refunded' are bookkeeping (the buyer now owns the item, so the route's own "already own"
// gate blocks any further attempt).
export async function markAchPayinByPi(
  paymentIntentId: string,
  status: 'succeeded' | 'failed' | 'refunded',
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('ach_payins').update({ status }).eq('payment_intent_id', paymentIntentId);
}
