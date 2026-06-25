-- Visby disputes (Phase 5.2) — buyer-opened claims against a paid/shipped/delivered order, plus the
-- order-side refund bookkeeping. A dispute can resolve to a refund (card or crypto, via the escrow
-- refund helper) or be denied/closed. Accessed server-side via the service-role client, so no RLS
-- policies are required. Idempotent: safe to run multiple times.
-- Run in the Supabase SQL editor (project rwdwzigqtfezbyqkfqfx) -> Run.

CREATE TABLE IF NOT EXISTS disputes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- order_id is NOT NULL + CASCADE so a dispute can never orphan or go NULL.
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id         uuid,
  buyer_wallet    text NOT NULL,
  seller_wallet   text NOT NULL,
  kind            text NOT NULL
                    CHECK (kind IN ('not_received','not_as_described','damaged','counterfeit','return','other')),
  reason          text,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','under_review','refunded','denied','closed')),
  resolution_note text,
  refund_amount_usd numeric(18,6),
  refund_tx       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     text
);

-- At most one ACTIVE dispute per order; closed/resolved ones don't block re-opening.
CREATE UNIQUE INDEX IF NOT EXISTS disputes_active_order_uniq
  ON disputes(order_id) WHERE status IN ('open','under_review');

CREATE INDEX IF NOT EXISTS disputes_status_idx ON disputes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS disputes_buyer_idx  ON disputes(buyer_wallet);
CREATE INDEX IF NOT EXISTS disputes_seller_idx ON disputes(seller_wallet);

-- orders: dispute flag + refund bookkeeping
ALTER TABLE orders ADD COLUMN IF NOT EXISTS disputed    boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_tx   text;

-- Extend the order status domain to allow 'refunded'.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('paid','shipped','delivered','cancelled','refunded'));

NOTIFY pgrst, 'reload schema';
