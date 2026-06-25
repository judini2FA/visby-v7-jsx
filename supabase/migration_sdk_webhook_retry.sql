-- VisbyPay SDK: durable merchant-webhook re-delivery.
-- Settlement (mint + transfer) is exactly-once and unaffected by this. The only gap was
-- notification durability: if the merchant endpoint was down when an order settled, the
-- inline 3x retry exhausted and the order.completed / order.payment_succeeded event was lost
-- forever. These columns drive a cron-swept exponential-backoff re-delivery over ~24h.
-- Run in the Supabase SQL editor, project rwdwzigqtfezbyqkfqfx. Idempotent: safe to re-run.

-- When the next background re-delivery is eligible. Set when a delivery fails (settlement or a
-- re-delivery round); NULL means nothing pending (delivered, never failed, or gave up).
ALTER TABLE public.sdk_orders ADD COLUMN IF NOT EXISTS webhook_next_attempt_at  timestamptz;

-- Background re-delivery rounds completed (distinct from webhook_attempts, which also counts the
-- 3 inline tries at settlement). Drives the backoff step and the give-up cap.
ALTER TABLE public.sdk_orders ADD COLUMN IF NOT EXISTS webhook_redelivery_count int NOT NULL DEFAULT 0;

ALTER TABLE public.sdk_orders ADD COLUMN IF NOT EXISTS webhook_last_attempt_at  timestamptz;
ALTER TABLE public.sdk_orders ADD COLUMN IF NOT EXISTS webhook_last_error       text;

-- The cron sweep scans for undelivered rows whose next attempt is due — partial index keeps that
-- cheap as the table grows (delivered rows, the vast majority, are excluded).
CREATE INDEX IF NOT EXISTS idx_sdk_orders_webhook_due
  ON public.sdk_orders (webhook_next_attempt_at)
  WHERE webhook_delivered = false;

-- Backfill: schedule one re-delivery sweep for any order that already settled (paid, terminal) with
-- an undelivered webhook. Without this, events lost before this migration would never be retried.
UPDATE public.sdk_orders
   SET webhook_next_attempt_at = now()
 WHERE webhook_delivered = false
   AND status IN ('minted', 'failed')
   AND webhook_next_attempt_at IS NULL;

NOTIFY pgrst, 'reload schema';
