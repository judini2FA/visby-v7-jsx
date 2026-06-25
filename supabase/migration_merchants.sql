-- Phase 4a — "Pay with Visby" merchant foundation
-- Run in the Supabase SQL editor, project rwdwzigqtfezbyqkfqfx.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS merchants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet      text NOT NULL,
  name              text NOT NULL,
  slug              text,
  merchant_wallet   text NOT NULL,
  publishable_key   text NOT NULL UNIQUE,
  secret_key_hash   text NOT NULL,
  secret_key_last4  text,
  webhook_url       text,
  webhook_secret    text NOT NULL,
  fee_bps           int NOT NULL DEFAULT 350,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchants_owner_wallet ON merchants (owner_wallet);

-- Tables hold merchant secrets (API key hash, webhook signing secret) + payout config.
-- RLS on with no policies = default-deny to the anon key that ships to the browser.
-- The app reaches these rows only through the service-role client, which bypasses RLS.
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sdk_orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id          uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_name         text NOT NULL,
  serial_number        text,
  price_usdc           numeric(18,6) NOT NULL,
  currency             text NOT NULL DEFAULT 'USD',
  buyer_wallet         text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','paid','minted','failed','cancelled')),
  nft_mint_address     text,
  stripe_payment_intent text,
  fee_bps              int,
  platform_fee_usd     numeric(18,6),
  merchant_net_usd     numeric(18,6),
  success_url          text,
  cancel_url           text,
  image_url            text,
  webhook_delivered    boolean NOT NULL DEFAULT false,
  webhook_attempts     int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  paid_at              timestamptz,
  minted_at            timestamptz
);

-- 4b adds image_url; ALTER patches tables created before this column existed.
ALTER TABLE sdk_orders ADD COLUMN IF NOT EXISTS image_url text;

-- Durable webhook re-delivery (see migration_sdk_webhook_retry.sql for the full rationale + index).
ALTER TABLE sdk_orders ADD COLUMN IF NOT EXISTS webhook_next_attempt_at  timestamptz;
ALTER TABLE sdk_orders ADD COLUMN IF NOT EXISTS webhook_redelivery_count int NOT NULL DEFAULT 0;
ALTER TABLE sdk_orders ADD COLUMN IF NOT EXISTS webhook_last_attempt_at  timestamptz;
ALTER TABLE sdk_orders ADD COLUMN IF NOT EXISTS webhook_last_error       text;

CREATE INDEX IF NOT EXISTS idx_sdk_orders_merchant_created
  ON sdk_orders (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sdk_orders_status ON sdk_orders (status);

ALTER TABLE sdk_orders ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
