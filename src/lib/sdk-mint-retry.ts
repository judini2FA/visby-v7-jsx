import { createServiceClient } from '@/lib/supabase/service';
import { mintProvenanceForSdk } from '@/lib/sdk-mint';
import { deliverSdkWebhook, buildSdkWebhookEvent, scheduleAfterFailure } from '@/lib/sdk-webhook';

// Background re-mint of SDK orders whose payment cleared but whose provenance mint failed at settle
// time (left at status='failed', paid, no NFT). Payment is never re-touched here — this only completes
// the mint that settlement couldn't, then advances the order failed->minted and fires the merchant's
// order.completed webhook (a NEW event id vs the earlier payment_succeeded, so it can't double-count).
//
// Driven by a cron sweep (POST/GET /api/sdk/retry-mints). Stateless and re-entrant: a per-row CAS lease
// means two overlapping sweeps can't both mint the same order, and a crashed worker's row becomes due
// again once the lease lapses. The lease filters on status='failed', so once a row mints it leaves the
// due-set permanently — a delivered mint can never be re-minted.

// Mint failures are typically transient (RPC flake, mint-authority briefly underfunded). Back off over
// ~3h before giving up; an exhausted row stays 'failed' (paid, recoverable by hand) and drops out.
export const MINT_BACKOFF_MS = [
  1 * 60_000,       // +1m
  5 * 60_000,       // +5m
  20 * 60_000,      // +20m
  60 * 60_000,      // +1h
  2 * 60 * 60_000,  // +2h
];
export const MAX_MINT_RETRIES = MINT_BACKOFF_MS.length;

const CLAIM_LEASE_MS = 5 * 60_000; // > a single mint+confirm round, so a peer won't re-claim mid-mint
const DEFAULT_BATCH = 25;

type DueRow = {
  id: string;
  status: string;
  buyer_wallet: string;
  product_name: string;
  serial_number: string | null;
  image_url: string | null;
  price_usdc: number;
  mint_retry_count: number;
  webhook_attempts: number;
  merchants:
    | { merchant_wallet: string; webhook_url: string | null; webhook_secret: string }
    | { merchant_wallet: string; webhook_url: string | null; webhook_secret: string }[]
    | null;
};

export type MintRetrySummary = {
  scanned: number;
  minted: number;
  failed: number;
  exhausted: number;
  skipped: number;
};

function merchantOf(row: DueRow) {
  const m = row.merchants;
  if (!m) return null;
  return Array.isArray(m) ? (m[0] ?? null) : m;
}

export async function retryFailedSdkMints(opts?: { limit?: number }): Promise<MintRetrySummary> {
  const supabase = createServiceClient();
  const limit = opts?.limit ?? DEFAULT_BATCH;
  const nowIso = new Date().toISOString();

  // Due = paid-but-unminted ('failed'), not yet exhausted, past its scheduled re-mint time.
  const { data, error } = await supabase
    .from('sdk_orders')
    .select(
      'id, status, buyer_wallet, product_name, serial_number, image_url, price_usdc, mint_retry_count, webhook_attempts, merchants(merchant_wallet, webhook_url, webhook_secret)'
    )
    .eq('status', 'failed')
    .lt('mint_retry_count', MAX_MINT_RETRIES)
    .not('mint_next_attempt_at', 'is', null)
    .lte('mint_next_attempt_at', nowIso)
    .order('mint_next_attempt_at', { ascending: true })
    .limit(limit);

  if (error) {
    // Columns absent (migration not run) / table unreachable → nothing to sweep, don't 500 the cron.
    const missing = error.code === '42703' || error.code === '42P01' || error.code === 'PGRST205' ||
      !!error.message?.includes('does not exist');
    if (missing) return { scanned: 0, minted: 0, failed: 0, exhausted: 0, skipped: 0 };
    throw new Error(error.message);
  }

  const due = (data ?? []) as unknown as DueRow[];
  const summary: MintRetrySummary = { scanned: due.length, minted: 0, failed: 0, exhausted: 0, skipped: 0 };

  for (const row of due) {
    // CAS lease claim: push mint_next_attempt_at into the future, but only if it's still due and still
    // 'failed'. Whoever's UPDATE matches owns the attempt; a peer's UPDATE then no longer matches (value
    // moved forward / status flipped to 'minted') and returns nothing.
    const leaseUntil = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
    const { data: claimed } = await supabase
      .from('sdk_orders')
      .update({ mint_next_attempt_at: leaseUntil })
      .eq('id', row.id)
      .eq('status', 'failed')
      .lte('mint_next_attempt_at', nowIso)
      .select('id')
      .maybeSingle();
    if (!claimed) { summary.skipped++; continue; }

    const merchant = merchantOf(row);
    const attemptIso = new Date().toISOString();
    const newCount = row.mint_retry_count + 1;

    // A row can't mint without its merchant origin wallet — exhaust it rather than spin forever.
    if (!merchant?.merchant_wallet) {
      await supabase.from('sdk_orders').update({
        mint_next_attempt_at: null,
        mint_last_attempt_at: attemptIso,
        mint_retry_count: newCount,
        mint_last_error: 'merchant origin wallet missing',
      }).eq('id', row.id);
      summary.exhausted++;
      continue;
    }

    const mint = await mintProvenanceForSdk({
      merchant_wallet: merchant.merchant_wallet,
      buyer_wallet: row.buyer_wallet,
      product_name: row.product_name,
      serial_number: row.serial_number ?? '',
      image_url: row.image_url,
    });

    if (!mint.ok) {
      const sched = scheduleAfterFailureMint(newCount, Date.now());
      await supabase.from('sdk_orders').update({
        mint_retry_count: newCount,
        mint_next_attempt_at: sched.next,
        mint_last_attempt_at: attemptIso,
        mint_last_error: sched.exhausted ? `gave up after ${newCount} re-mints: ${mint.error}` : mint.error,
      }).eq('id', row.id);
      if (sched.exhausted) summary.exhausted++; else summary.failed++;
      continue;
    }

    // Minted at last. Advance failed->minted (leaves the due-set), then fire order.completed. This is a
    // DIFFERENT webhook event than the earlier order.payment_succeeded (distinct stable id), so it can't
    // be deduped away by the merchant as a repeat. Reset the webhook re-delivery budget for this fresh
    // event; on inline-delivery failure the existing webhook sweep takes it from here.
    await supabase.from('sdk_orders').update({
      status: 'minted',
      nft_mint_address: mint.mint_address,
      minted_at: attemptIso,
      mint_retry_count: newCount,
      mint_next_attempt_at: null,
      mint_last_attempt_at: attemptIso,
      mint_last_error: null,
    }).eq('id', row.id);
    summary.minted++;

    const event = buildSdkWebhookEvent({
      order_id: row.id,
      minted: true,
      nft_address: mint.mint_address,
      serial_number: row.serial_number,
      product_name: row.product_name,
      amount_usd: Number(row.price_usdc),
    });
    const delivery = await deliverSdkWebhook({
      webhook_url: merchant.webhook_url,
      webhook_secret: merchant.webhook_secret,
      event,
      timeoutMs: 10_000,
    });

    const webhookPatch: Record<string, unknown> = {
      webhook_delivered: delivery.delivered,
      webhook_attempts: (row.webhook_attempts ?? 0) + delivery.attempts,
      webhook_redelivery_count: 0,
      webhook_last_attempt_at: attemptIso,
    };
    if (delivery.delivered) {
      webhookPatch.webhook_next_attempt_at = null;
      webhookPatch.webhook_last_error = null;
    } else if (merchant.webhook_url) {
      webhookPatch.webhook_next_attempt_at = scheduleAfterFailure(0, Date.now()).webhook_next_attempt_at;
      webhookPatch.webhook_last_error = 'delivery failed';
    }
    await supabase.from('sdk_orders').update(webhookPatch).eq('id', row.id);
  }

  return summary;
}

function scheduleAfterFailureMint(roundsCompleted: number, nowMs: number): { next: string | null; exhausted: boolean } {
  if (roundsCompleted >= MINT_BACKOFF_MS.length) return { next: null, exhausted: true };
  return { next: new Date(nowMs + MINT_BACKOFF_MS[roundsCompleted]).toISOString(), exhausted: false };
}
