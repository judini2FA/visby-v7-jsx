import Stripe from 'stripe';
import { Connection, PublicKey } from '@solana/web3.js';
import { createServiceClient } from '@/lib/supabase/service';
import { getRpcUrl } from '@/lib/nft';
import { mintProvenanceForSdk } from '@/lib/sdk-mint';
import { deliverSdkWebhook, buildSdkWebhookEvent, scheduleAfterFailure } from '@/lib/sdk-webhook';
import { emailWallet } from '@/lib/email';
import { sdkOrderCompletedBuyer } from '@/lib/email-templates';
import { captureError, captureMessage } from '@/lib/monitoring';
import { solUsd } from '@/lib/price-oracle';

// Shared SDK-order settlement: verify the cleared payment, atomically claim the order (exactly-once), mint
// the provenance NFT, and fire the merchant webhook. Used by the manual card flow (/api/sdk/settle), the
// one-tap saved-card flow (/api/sdk/charge-saved), and the crypto-balance flow (/api/sdk/charge-wallet) so
// settlement has a single source of truth.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const TREASURY = process.env.MINT_AUTHORITY_ADDRESS!;
const SLIPPAGE_TOLERANCE = 0.02;

export type FinalizeResult =
  | { ok: true; minted: boolean; nft_address: string | null; success_url: string | null }
  | { ok: false; status: number; error: string };

type Loaded = { ok: true; order: any; merchant: any } | { ok: false; result: FinalizeResult };

async function loadOrderAndMerchant(supabase: ReturnType<typeof createServiceClient>, session_id: string): Promise<Loaded> {
  const { data: order, error: orderError } = await supabase
    .from('sdk_orders').select('*').eq('id', session_id).maybeSingle();
  if (orderError) return { ok: false, result: { ok: false, status: 503, error: 'Checkout unavailable' } };
  if (!order) return { ok: false, result: { ok: false, status: 404, error: 'Session not found' } };

  const { data: merchant, error: merchantError } = await supabase
    .from('merchants').select('merchant_wallet, webhook_url, webhook_secret').eq('id', order.merchant_id).maybeSingle();
  if (merchantError) return { ok: false, result: { ok: false, status: 503, error: 'Checkout unavailable' } };
  if (!merchant) return { ok: false, result: { ok: false, status: 404, error: 'Merchant not found' } };

  return { ok: true, order, merchant };
}

// Shared tail: order is ALREADY claimed (status pending→paid by the caller's CAS). Mint provenance, advance
// to 'minted' (or 'failed' — re-mintable, never reported as success), and deliver the signed webhook.
async function mintAndDeliver(
  supabase: ReturnType<typeof createServiceClient>,
  order: any, merchant: any, now: string,
): Promise<FinalizeResult> {
  const mint = await mintProvenanceForSdk({
    merchant_wallet: merchant.merchant_wallet,
    buyer_wallet: order.buyer_wallet,
    product_name: order.product_name,
    serial_number: order.serial_number,
    image_url: order.image_url ?? null,
  });

  if (mint.ok) {
    await supabase.from('sdk_orders')
      .update({ status: 'minted', nft_mint_address: mint.mint_address, minted_at: now })
      .eq('id', order.id);
  } else {
    await supabase.from('sdk_orders').update({ status: 'failed' }).eq('id', order.id);
    // Arm the background re-mint sweep (/api/sdk/retry-mints). Separate, tolerant update so a pre-migration
    // schema (no mint_next_attempt_at column) still records 'failed' cleanly — the migration's backfill
    // then schedules these rows once it runs. 42703/PGRST204 = column absent (expected pre-migration).
    const { error: armErr } = await supabase
      .from('sdk_orders')
      .update({ mint_next_attempt_at: new Date(Date.parse(now) + 60_000).toISOString() })
      .eq('id', order.id);
    if (armErr && armErr.code !== '42703' && armErr.code !== 'PGRST204') {
      console.error(`[sdk] could not arm mint retry for order ${order.id}: ${armErr.message}`);
      captureError(armErr, { stage: 'sdk arm mint retry', order_id: order.id });
    }
    console.error(
      `[sdk] MINT FAILED after payment for order ${order.id} — left 'failed' (paid, no NFT) for retry: ${mint.error}`
    );
    captureMessage('error', '[sdk] mint failed after payment', { order_id: order.id, error: mint.error });
  }

  const delivery = await deliverSdkWebhook({
    webhook_url: merchant.webhook_url,
    webhook_secret: merchant.webhook_secret,
    event: buildSdkWebhookEvent({
      order_id: order.id,
      minted: mint.ok,
      nft_address: mint.ok ? mint.mint_address : null,
      serial_number: order.serial_number,
      product_name: order.product_name,
      amount_usd: order.price_usdc,
    }),
  });

  // Record the outcome. On failure with a configured endpoint, arm the background re-delivery
  // (round 0); the cron sweep in /api/sdk/redeliver-webhooks takes it from here so a momentarily
  // down endpoint no longer loses the event. Idempotency lives in the event's stable `id`, so a
  // later re-delivery can't double-fire a notification the merchant already accepted.
  const webhookPatch: Record<string, unknown> = {
    webhook_delivered: delivery.delivered,
    webhook_attempts: delivery.attempts,
    webhook_last_attempt_at: now,
  };
  if (delivery.delivered) {
    webhookPatch.webhook_next_attempt_at = null;
    webhookPatch.webhook_last_error = null;
  } else if (merchant.webhook_url) {
    webhookPatch.webhook_next_attempt_at = scheduleAfterFailure(0, Date.parse(now)).webhook_next_attempt_at;
    webhookPatch.webhook_last_error = 'delivery failed';
  }
  await supabase.from('sdk_orders').update(webhookPatch).eq('id', order.id);

  void emailWallet(order.buyer_wallet, sdkOrderCompletedBuyer({ productName: order.product_name, amountUsd: order.price_usdc, minted: mint.ok, nftAddress: mint.ok ? mint.mint_address : null }));

  return { ok: true, minted: mint.ok, nft_address: mint.ok ? mint.mint_address : null, success_url: order.success_url ?? null };
}

// ── Card settlement (manual + one-tap): the payment is a cleared Stripe PaymentIntent. ──
export async function finalizeSdkOrder(
  { session_id, buyer_wallet, payment_intent_id }:
  { session_id: string; buyer_wallet: string; payment_intent_id: string }
): Promise<FinalizeResult> {
  const supabase = createServiceClient();
  const loaded = await loadOrderAndMerchant(supabase, session_id);
  if (!loaded.ok) return loaded.result;
  const { order, merchant } = loaded;

  // Verify the payment — succeeded, exact amount, bound to this session + buyer (metadata is set server-side
  // at charge time, so it's the trusted proof of WHO paid; the NFT mints to that wallet, not a caller-supplied one).
  const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
  const expectedAmount = Math.round(order.price_usdc * 100);
  if (
    pi.status !== 'succeeded' || pi.amount !== expectedAmount ||
    pi.metadata?.sdk_order_id !== session_id || pi.metadata?.buyer_wallet !== buyer_wallet
  ) {
    return { ok: false, status: 402, error: 'Payment not verified' };
  }

  // Atomic claim — exactly-once. CAS pending→'paid' ensures only ONE request proceeds to mint.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('sdk_orders')
    .update({ status: 'paid', buyer_wallet, paid_at: now, stripe_payment_intent: payment_intent_id })
    .eq('id', session_id).eq('status', 'pending').select().maybeSingle();
  if (claimError) return { ok: false, status: 503, error: 'Checkout unavailable' };
  if (!claimed) return { ok: false, status: 409, error: 'Already settled' };

  return mintAndDeliver(supabase, claimed, merchant, now);
}

async function getSolPrice(): Promise<number | null> {
  // Fund-moving (slippage check): always a fresh multi-source read — see price-oracle.ts.
  const p = await solUsd({ fresh: true });
  return p > 0 ? p : null;
}

// ── Crypto settlement: the payment is an on-chain SOL transfer the buyer signed to the treasury. ──
export async function settleSdkOrderCrypto(
  { session_id, buyer_wallet, tx_signature, quoted_sol_price }:
  { session_id: string; buyer_wallet: string; tx_signature: string; quoted_sol_price?: number }
): Promise<FinalizeResult> {
  const supabase = createServiceClient();
  const loaded = await loadOrderAndMerchant(supabase, session_id);
  if (!loaded.ok) return loaded.result;
  const { order, merchant } = loaded;
  if (order.status !== 'pending') return { ok: false, status: 409, error: 'Already settled' };

  // Verify the on-chain transfer: confirmed, succeeded, buyer is the signer, treasury actually received SOL,
  // and the USD-equivalent matches the price within slippage.
  const connection = new Connection(getRpcUrl(), 'confirmed');
  const tx = await connection.getTransaction(tx_signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) return { ok: false, status: 400, error: 'Transaction not found on-chain' };
  if (tx.meta?.err) return { ok: false, status: 400, error: 'Transaction failed on-chain' };

  const accountKeys = tx.transaction.message.getAccountKeys
    ? tx.transaction.message.getAccountKeys().staticAccountKeys
    : (tx.transaction.message as any).accountKeys as PublicKey[];

  if (accountKeys[0]?.toBase58() !== buyer_wallet) {
    return { ok: false, status: 400, error: 'Transaction signer does not match buyer' };
  }
  const treasuryIdx = accountKeys.findIndex((k: PublicKey) => k.toBase58() === TREASURY);
  if (treasuryIdx === -1) return { ok: false, status: 400, error: 'Treasury not found in transaction' };

  const solReceived = ((tx.meta!.postBalances[treasuryIdx] ?? 0) - (tx.meta!.preBalances[treasuryIdx] ?? 0)) / 1e9;
  if (solReceived <= 0) return { ok: false, status: 400, error: 'No SOL received at treasury' };

  // Value the SOL with the server-side oracle — never the client-supplied quote alone, which a buyer could
  // inflate (e.g. 4000 vs the real ~200) so a token amount of real SOL clears the USD check. The quote is
  // honored only as a UX hint when it already agrees with the oracle; otherwise we fall back to the oracle,
  // which a padded transfer can't satisfy.
  const oraclePrice = await getSolPrice();
  if (!oraclePrice) return { ok: false, status: 503, error: 'Price feed unavailable, retry' };
  const quoteWithinTolerance =
    typeof quoted_sol_price === 'number' && quoted_sol_price > 0 &&
    Math.abs(quoted_sol_price - oraclePrice) / oraclePrice <= SLIPPAGE_TOLERANCE;
  const solPrice = quoteWithinTolerance ? quoted_sol_price : oraclePrice;
  const paidUsd = solReceived * solPrice;
  if (Math.abs(paidUsd - order.price_usdc) / order.price_usdc > SLIPPAGE_TOLERANCE) {
    return { ok: false, status: 400, error: `Payment mismatch: received ~$${paidUsd.toFixed(2)}, expected $${order.price_usdc.toFixed(2)}` };
  }

  // Atomic claim + replay guard in one shot: CAS pending→'paid' recording the signature. A unique index on
  // sol_signature blocks the same tx settling a different order (23505); the status='pending' filter blocks
  // the same order settling twice. Insert-first replay protection — no check-then-insert race.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('sdk_orders')
    .update({ status: 'paid', buyer_wallet, paid_at: now, pay_method: 'crypto', sol_signature: tx_signature })
    .eq('id', session_id).eq('status', 'pending').select().maybeSingle();
  if (claimError) {
    if (claimError.code === '23505') return { ok: false, status: 409, error: 'Transaction already used' };
    return { ok: false, status: 503, error: 'Checkout unavailable' };
  }
  if (!claimed) return { ok: false, status: 409, error: 'Already settled' };

  return mintAndDeliver(supabase, claimed, merchant, now);
}
