-- Visby monetization (Phase 5) — tiered platform fee + escrow payout bookkeeping on orders.
-- Fee tiers live in src/lib/fees.ts (visby 9% / partner 3.5%); these columns record what was actually
-- charged per order and the payout result. The fee is deducted from the seller; shipping is withheld
-- separately (orders.shipping_cost). Buyer funds are held until delivery, then the seller's net is
-- released (Stripe transfer for card, treasury->seller SOL transfer for crypto). Idempotent.
-- Run in Supabase dashboard -> SQL Editor -> Run. ALTERs don't trigger RLS prompts.

-- which take-rate tier applied: 'visby' (on-platform, default) | 'partner' (embedded/API channel)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sale_channel  text NOT NULL DEFAULT 'visby';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fee_bps       int;                 -- basis points applied
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee_usd numeric(18,6);    -- Visby's cut
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_net_usd   numeric(18,6);    -- price - fee - shipping
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_method    text;             -- 'card' | 'crypto'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent text;        -- PI to transfer from (card)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_tx        text;             -- Stripe transfer id / SOL sig

-- Belt-and-suspenders: payout_released also lives in migration_orders.sql; ensure it exists if only
-- this file is run against a fresh schema.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_released boolean NOT NULL DEFAULT false;

-- Atomic dedup: at most ONE active (paid/shipped) order per item. Stripe delivers both
-- checkout.session.completed AND payment_intent.succeeded for one Hosted Checkout sale; without this,
-- the non-atomic SELECT-then-INSERT in createOrder could race into two order rows for one sale, each of
-- which could be confirmed and pay the seller — i.e. double payout. Delivered/cancelled orders are
-- excluded so an item can still be re-sold later.
-- NOTE: if this errors, an active duplicate already exists — delete the extra row, then re-run.
CREATE UNIQUE INDEX IF NOT EXISTS orders_active_item_uniq ON orders(item_id) WHERE status IN ('paid','shipped');
