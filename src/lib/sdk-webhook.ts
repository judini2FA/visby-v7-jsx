import { signWebhookPayload } from '@/lib/merchants';

type WebhookEventArgs = {
  order_id: string;
  minted: boolean;
  nft_address: string | null;
  serial_number: string | null;
  product_name: string;
  amount_usd: number;
};

// The webhook event for a settled SDK order. The `id` is STABLE across the original settle
// delivery and every later re-delivery of the same event, so a merchant can dedupe on it — the
// idempotency key that makes re-delivery safe even if a delivery succeeded on their end but our
// success-record write was lost. Type is folded into the id so a payment_succeeded (paid, mint
// pending) and a later completed (minted) are distinct events, each deduped independently.
export function buildSdkWebhookEvent(args: WebhookEventArgs): Record<string, unknown> {
  const kind = args.minted ? 'completed' : 'payment_succeeded';
  return {
    id: `evt_${args.order_id}_${kind}`,
    type: `order.${kind}`,
    order_id: args.order_id,
    minted: args.minted,
    nft_address: args.nft_address,
    serial_number: args.serial_number,
    product_name: args.product_name,
    amount_usd: args.amount_usd,
    payment_confirmed: true,
  };
}

// Background re-delivery backoff, indexed by re-delivery rounds already completed. Settlement
// schedules round 0 at +1m; each failure pushes the next round out. After the last entry is
// attempted we give up (cumulative ~14.6h, well under the ~24h cap).
export const WEBHOOK_BACKOFF_MS = [
  1 * 60_000,        // +1m
  5 * 60_000,        // +5m
  30 * 60_000,       // +30m
  2 * 60 * 60_000,   // +2h
  12 * 60 * 60_000,  // +12h
];
export const MAX_WEBHOOK_REDELIVERIES = WEBHOOK_BACKOFF_MS.length;

// Given how many re-delivery rounds have completed, when should the NEXT one fire? Returns a null
// schedule once the cap is reached (give up — the row drops out of the cron's due-set).
export function scheduleAfterFailure(
  roundsCompleted: number,
  nowMs: number
): { webhook_next_attempt_at: string | null; exhausted: boolean } {
  if (roundsCompleted >= WEBHOOK_BACKOFF_MS.length) {
    return { webhook_next_attempt_at: null, exhausted: true };
  }
  return {
    webhook_next_attempt_at: new Date(nowMs + WEBHOOK_BACKOFF_MS[roundsCompleted]).toISOString(),
    exhausted: false,
  };
}

type WebhookArgs = {
  webhook_url: string | null;
  webhook_secret: string;
  event: Record<string, unknown>;
  // Bound each HTTP attempt (used by the background sweep so a hung endpoint can't stall the run).
  // Omitted by the settle path → unchanged behavior there.
  timeoutMs?: number;
};

// Best-effort signed delivery: never throws, so a flaky merchant endpoint can't
// break the settle that already minted + transferred the NFT.
export async function deliverSdkWebhook(
  args: WebhookArgs
): Promise<{ delivered: boolean; attempts: number }> {
  const { webhook_url, webhook_secret, event, timeoutMs } = args;
  if (!webhook_url) return { delivered: false, attempts: 0 };

  const payloadJson = JSON.stringify(event);
  const timestampSec = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(payloadJson, webhook_secret, timestampSec);

  let attempts = 0;
  for (let i = 0; i < 3; i++) {
    attempts++;
    try {
      const res = await fetch(webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Visby-Signature': signature,
          'User-Agent': 'Visby-Webhooks/1',
        },
        body: payloadJson,
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      });
      if (res.ok) return { delivered: true, attempts };
    } catch {
      // network error / timeout — retry below
    }
  }

  return { delivered: false, attempts };
}
