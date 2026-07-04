import { createServiceClient } from '@/lib/supabase/service';
import { sendUsdcFromAuthority } from '@/lib/solana-fund';
import { captureError } from '@/lib/monitoring';

// Blueprint 5.6 — SDK merchant payout settlement. An SDK sale mints the BUYER's NFT and lands the
// buyer's payment in the Visby treasury; this pays the MERCHANT their pre-computed `merchant_net_usd`
// (price − the 3.5% platform fee) in USDC (1:1 USD, via sendUsdcFromAuthority) to their merchant_wallet.
//
// Design: a cron SWEEP does the payout, decoupled from the buyer's checkout (so the mint hot path is
// untouched and the buyer never waits on a treasury transfer). Exactly-once is enforced by a DB CAS
// claim BEFORE the transfer (sendUsdcFromAuthority has no on-chain idempotency key, same as the
// marketplace crypto payout) — so a concurrent sweep or a retry can't double-pay a 'paid'/'processing'
// row. A crash between the claim and the write leaves a 'processing' row that the sweep does NOT
// auto-reclaim (that could double-pay if the crash was post-transfer) — it's logged for manual
// reconciliation instead. This mirrors the standing crypto-payout risk profile; see memory.md.

const RETRY_BACKOFF_MS = 10 * 60_000; // 10 minutes between failed-payout retries
const DEFAULT_BATCH = 50;

export type MerchantPayoutSummary = { scanned: number; paid: number; failed: number; skipped: number };

// Claim the payout exactly-once (pending|failed → processing) then send USDC. Never throws — it records
// the outcome and returns a tag. `order` must be a minted sdk_order with merchant_net_usd + id.
async function attemptMerchantPayout(
  supabase: ReturnType<typeof createServiceClient>,
  order: { id: string; merchant_net_usd: number | null },
  merchantWallet: string | null,
): Promise<'paid' | 'skipped' | 'failed' | 'noop'> {
  const net = Number(order.merchant_net_usd ?? 0);
  if (!(net > 0)) return 'noop';           // nothing owed
  if (!merchantWallet) return 'noop';      // no destination on file

  // CAS claim — only the worker that flips pending|failed → processing proceeds; a peer's update no
  // longer matches. A 'paid' or already-'processing' row is never re-sent.
  const { data: claimed } = await supabase
    .from('sdk_orders')
    .update({ merchant_payout_status: 'processing' })
    .eq('id', order.id)
    .in('merchant_payout_status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (!claimed) return 'skipped';

  try {
    const sig = await sendUsdcFromAuthority(merchantWallet, net);
    await supabase.from('sdk_orders').update({
      merchant_payout_status: 'paid',
      merchant_payout_tx: sig,
      merchant_payout_at: new Date().toISOString(),
      merchant_payout_next_attempt_at: null,
      merchant_payout_last_error: null,
    }).eq('id', order.id);
    return 'paid';
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'merchant payout failed';
    await supabase.from('sdk_orders').update({
      merchant_payout_status: 'failed',
      merchant_payout_next_attempt_at: new Date(Date.now() + RETRY_BACKOFF_MS).toISOString(),
      merchant_payout_last_error: msg,
    }).eq('id', order.id);
    captureError(err, { stage: 'attemptMerchantPayout', order_id: order.id });
    return 'failed';
  }
}

// Cron sweep: pay every minted order still owed its merchant cut — 'pending' (never paid) or 'failed'
// (a prior attempt, now due for retry). Re-entrant: the per-row CAS means two overlapping sweeps can't
// both pay the same order.
export async function runDueMerchantPayouts(opts?: { limit?: number }): Promise<MerchantPayoutSummary> {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const limit = opts?.limit ?? DEFAULT_BATCH;

  const { data, error } = await supabase
    .from('sdk_orders')
    .select('id, merchant_net_usd, merchant_payout_status, merchant_payout_next_attempt_at, merchants(merchant_wallet)')
    .eq('status', 'minted')
    .in('merchant_payout_status', ['pending', 'failed'])
    .or(`merchant_payout_next_attempt_at.is.null,merchant_payout_next_attempt_at.lte.${nowIso}`)
    .limit(limit);

  if (error) {
    // Pre-migration the merchant_payout_* columns don't exist — treat as "nothing due" (mirrors the
    // other SDK sweeps) so the cron returns clean instead of 500.
    const missing = ['42703', '42P01', 'PGRST205', 'PGRST204'].includes(error.code ?? '') || !!error.message?.includes('does not exist');
    if (missing) return { scanned: 0, paid: 0, failed: 0, skipped: 0 };
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{ id: string; merchant_net_usd: number | null; merchants: { merchant_wallet: string | null } | { merchant_wallet: string | null }[] | null }>;
  const summary: MerchantPayoutSummary = { scanned: rows.length, paid: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    const m = row.merchants;
    const wallet = m ? (Array.isArray(m) ? (m[0]?.merchant_wallet ?? null) : m.merchant_wallet) : null;
    const res = await attemptMerchantPayout(supabase, row, wallet);
    if (res === 'paid') summary.paid++;
    else if (res === 'failed') summary.failed++;
    else summary.skipped++;
  }

  return summary;
}
