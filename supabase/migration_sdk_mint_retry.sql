-- VisbyPay SDK: durable provenance-mint retry.
-- Payment settlement is exactly-once (CAS pending->paid). The remaining gap was the MINT: if the
-- on-chain mint failed after the payment cleared (RPC flake / mint-authority out of SOL), the order
-- was parked at status='failed' (paid, no NFT) and nothing ever re-minted it. The webhook sweep only
-- re-fires the notification; it does not mint. These columns drive a cron-swept exponential-backoff
-- re-mint, after which the order advances failed->minted and the (new) order.completed webhook fires.
-- Run in the Supabase SQL editor, project rwdwzigqtfezbyqkfqfx. Idempotent: safe to re-run.

-- When the next background re-mint is eligible. Armed when settlement leaves an order 'failed';
-- NULL means nothing pending (already minted, or gave up after the retry cap).
ALTER TABLE public.sdk_orders ADD COLUMN IF NOT EXISTS mint_next_attempt_at timestamptz;

-- Background re-mint rounds completed. Drives the backoff step and the give-up cap.
ALTER TABLE public.sdk_orders ADD COLUMN IF NOT EXISTS mint_retry_count int NOT NULL DEFAULT 0;

ALTER TABLE public.sdk_orders ADD COLUMN IF NOT EXISTS mint_last_attempt_at timestamptz;
ALTER TABLE public.sdk_orders ADD COLUMN IF NOT EXISTS mint_last_error      text;

-- The cron sweep scans for failed orders whose next re-mint is due — partial index keeps that cheap
-- as the table grows (the vast majority of rows are 'minted' and excluded).
CREATE INDEX IF NOT EXISTS idx_sdk_orders_mint_due
  ON public.sdk_orders (mint_next_attempt_at)
  WHERE status = 'failed';

-- Backfill: schedule one re-mint sweep for any order already parked at 'failed' with no NFT. Without
-- this, mints lost before this migration would never be retried.
UPDATE public.sdk_orders
   SET mint_next_attempt_at = now()
 WHERE status = 'failed'
   AND nft_mint_address IS NULL
   AND mint_next_attempt_at IS NULL;

NOTIFY pgrst, 'reload schema';
