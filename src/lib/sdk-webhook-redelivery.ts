import { createServiceClient } from '@/lib/supabase/service';
import {
  deliverSdkWebhook,
  buildSdkWebhookEvent,
  scheduleAfterFailure,
  MAX_WEBHOOK_REDELIVERIES,
} from '@/lib/sdk-webhook';

// Background re-delivery of SDK merchant webhooks that the settle path couldn't deliver. Settlement
// (payment + mint + NFT transfer) is exactly-once and untouched here — this only re-fires the lost
// `order.completed` / `order.payment_succeeded` notification, on the backoff schedule in sdk-webhook.
//
// Driven by a cron sweep (POST/GET /api/sdk/redeliver-webhooks). Stateless and re-entrant: a per-row
// CAS lease claim means two overlapping sweeps can't both deliver the same row, and a crashed worker's
// row becomes due again once the lease lapses. Merchant-side dedup on the event's stable `id` covers
// the residual case where a delivery succeeded on their end but our success write was lost.

const CLAIM_LEASE_MS = 2 * 60_000;
const PER_ATTEMPT_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH = 50;

type DueRow = {
  id: string;
  status: string;
  nft_mint_address: string | null;
  serial_number: string | null;
  product_name: string;
  price_usdc: number;
  webhook_attempts: number;
  webhook_redelivery_count: number;
  merchants: { webhook_url: string | null; webhook_secret: string } | { webhook_url: string | null; webhook_secret: string }[] | null;
};

export type RedeliverySummary = {
  scanned: number;
  delivered: number;
  failed: number;
  exhausted: number;
  skipped: number;
};

function merchantOf(row: DueRow): { webhook_url: string | null; webhook_secret: string } | null {
  const m = row.merchants;
  if (!m) return null;
  return Array.isArray(m) ? (m[0] ?? null) : m;
}

export async function redeliverPendingSdkWebhooks(opts?: { limit?: number }): Promise<RedeliverySummary> {
  const supabase = createServiceClient();
  const limit = opts?.limit ?? DEFAULT_BATCH;
  const nowIso = new Date().toISOString();

  // Due = undelivered, in a terminal paid state, not yet exhausted, and past its scheduled time.
  const { data, error } = await supabase
    .from('sdk_orders')
    .select(
      'id, status, nft_mint_address, serial_number, product_name, price_usdc, webhook_attempts, webhook_redelivery_count, merchants(webhook_url, webhook_secret)'
    )
    .eq('webhook_delivered', false)
    .in('status', ['minted', 'failed'])
    .lt('webhook_redelivery_count', MAX_WEBHOOK_REDELIVERIES)
    .not('webhook_next_attempt_at', 'is', null)
    .lte('webhook_next_attempt_at', nowIso)
    .order('webhook_next_attempt_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const due = (data ?? []) as unknown as DueRow[];
  const summary: RedeliverySummary = { scanned: due.length, delivered: 0, failed: 0, exhausted: 0, skipped: 0 };

  for (const row of due) {
    // CAS lease claim: push webhook_next_attempt_at into the future, but only if it's still due and
    // still undelivered. Whoever's UPDATE matches owns the attempt; a peer's UPDATE then no longer
    // matches (value moved into the future / delivered flipped) and returns nothing.
    const leaseUntil = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
    const { data: claimed } = await supabase
      .from('sdk_orders')
      .update({ webhook_next_attempt_at: leaseUntil })
      .eq('id', row.id)
      .eq('webhook_delivered', false)
      .lte('webhook_next_attempt_at', nowIso)
      .select('id')
      .maybeSingle();
    if (!claimed) { summary.skipped++; continue; }

    const merchant = merchantOf(row);

    // No endpoint to deliver to — stop retrying this row (the merchant can re-arm by configuring a URL
    // on a future order; back-filling old orders on URL-add is out of scope).
    if (!merchant?.webhook_url) {
      await supabase.from('sdk_orders').update({
        webhook_next_attempt_at: null,
        webhook_last_attempt_at: new Date().toISOString(),
        webhook_last_error: 'no webhook_url configured',
      }).eq('id', row.id);
      summary.exhausted++;
      continue;
    }

    const minted = row.status === 'minted';
    const event = buildSdkWebhookEvent({
      order_id: row.id,
      minted,
      nft_address: minted ? row.nft_mint_address : null,
      serial_number: row.serial_number,
      product_name: row.product_name,
      amount_usd: Number(row.price_usdc),
    });

    const delivery = await deliverSdkWebhook({
      webhook_url: merchant.webhook_url,
      webhook_secret: merchant.webhook_secret,
      event,
      timeoutMs: PER_ATTEMPT_TIMEOUT_MS,
    });

    const attemptIso = new Date().toISOString();
    const newCount = row.webhook_redelivery_count + 1;

    if (delivery.delivered) {
      await supabase.from('sdk_orders').update({
        webhook_delivered: true,
        webhook_attempts: row.webhook_attempts + delivery.attempts,
        webhook_redelivery_count: newCount,
        webhook_next_attempt_at: null,
        webhook_last_attempt_at: attemptIso,
        webhook_last_error: null,
      }).eq('id', row.id);
      summary.delivered++;
      continue;
    }

    const sched = scheduleAfterFailure(newCount, Date.now());
    await supabase.from('sdk_orders').update({
      webhook_attempts: row.webhook_attempts + delivery.attempts,
      webhook_redelivery_count: newCount,
      webhook_next_attempt_at: sched.webhook_next_attempt_at,
      webhook_last_attempt_at: attemptIso,
      webhook_last_error: sched.exhausted ? `gave up after ${newCount} re-deliveries` : 'delivery failed',
    }).eq('id', row.id);
    if (sched.exhausted) summary.exhausted++; else summary.failed++;
  }

  return summary;
}
