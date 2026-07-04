-- ============================================================
-- VISBY — PENDING MIGRATIONS BUNDLE (generated 2026-07-03)
-- Paste this WHOLE file into the Supabase SQL editor and Run ONCE.
-- Every statement is idempotent — safe to re-run if it errors partway.
-- Contents: 12 unrun migrations + 4 RLS/policy files (re-applied to be sure)
--           + 2 new Phase-1 security migrations (2026-07-03).
-- ============================================================

-- ──────────────────────────────────────────────
-- >>> migration_kyc.sql
-- ──────────────────────────────────────────────
-- Phase 6 — KYC / ID verification (Persona). Adds verification status to profiles + a per-inquiry audit
-- table. Selling (mint / list / relist) is gated on kyc_status='approved' ONLY when the single flag
-- NEXT_PUBLIC_KYC_REQUIRED=1 is set — so turning KYC on is a deliberate switch and existing sellers are
-- never instantly blocked until that flip. Service-role-only table (RLS, no policies). Idempotent.
--
-- ROLLOUT: run this migration, get Persona keys (PERSONA_API_KEY / PERSONA_WEBHOOK_SECRET /
-- PERSONA_KYC_TEMPLATE_ID, plus PERSONA_KYB_TEMPLATE_ID for business), point Persona's webhook at
-- /api/kyc/webhook, THEN set NEXT_PUBLIC_KYC_REQUIRED=1 (+ redeploy) to enforce. Until then the whole
-- flow is dormant/no-op: /api/kyc/start returns 503 without a key, and selling is ungated.

alter table public.profiles add column if not exists kyc_status text not null default 'unverified';
alter table public.profiles add column if not exists account_type text not null default 'personal';
alter table public.profiles add column if not exists kyc_verified_at timestamptz;

create table if not exists public.kyc_verifications (
  id           uuid primary key default gen_random_uuid(),
  wallet       text not null,
  account_type text not null default 'personal',
  provider     text not null default 'persona',
  inquiry_id   text,
  template_id  text,
  status       text not null default 'created',
  reason       text,
  raw          jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists kyc_verifications_wallet_idx on public.kyc_verifications (wallet);
create unique index if not exists kyc_verifications_inquiry_idx on public.kyc_verifications (inquiry_id) where inquiry_id is not null;
alter table public.kyc_verifications enable row level security;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_brand_registry.sql
-- ──────────────────────────────────────────────
-- Phase 5 — Brand serial-number registry.
-- Brands register the shape of their genuine serial numbers; at mint time a serial that *claims* to be
-- a registered brand (matches the brand's claim pattern) but falls *outside* its registered valid space
-- is rejected as a likely counterfeit, while a genuine one is stamped brand-verified. Serials that no
-- brand claims pass through untouched (generic goods are unaffected). Fail-open by design: if these
-- tables are absent or hold no active rules, every serial reads 'unregistered' and minting is unchanged.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create extension if not exists pgcrypto;

-- A registered brand identity. `verified` = Visby vetted that this party actually controls the brand
-- (drives whether the on-item badge should read "Brand-verified by <brand>").
create table if not exists public.brand_registry (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  display_name  text not null,
  verified      boolean not null default false,
  contact_email text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- How to recognize and validate a brand's serials.
--   claim_regex  : if a serial matches this, it PURPORTS to be from this brand (required).
--   valid_regex  : a genuine serial must ALSO match this tighter pattern (optional).
--   range_prefix : strip this prefix before the numeric range test (optional).
--   range_min/max: the serial's core must fall within [min, max] — numeric if both parse as ints,
--                  else lexical (optional). A rule with neither valid_regex nor a range treats every
--                  claim-matching serial as genuine (a brand asserting "this whole format is ours").
-- A claimed serial is GENUINE if it satisfies AT LEAST ONE active rule for the brand; if it claims the
-- brand but satisfies none, it is rejected. Regexes are admin-authored (trusted) — see the admin API.
create table if not exists public.brand_serial_rules (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brand_registry(id) on delete cascade,
  claim_regex  text not null,
  valid_regex  text,
  range_prefix text,
  range_min    text,
  range_max    text,
  is_active    boolean not null default true,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_brand_serial_rules_brand on public.brand_serial_rules(brand_id) where is_active;

-- Explicit per-serial overrides that beat the rules: 'revoked'/'stolen'/'recalled' force a reject even
-- if the ranges would pass; 'allow' force-verifies a one-off the ranges miss.
create table if not exists public.brand_serial_flags (
  brand_id      uuid not null references public.brand_registry(id) on delete cascade,
  serial_number text not null,
  flag          text not null check (flag in ('revoked','stolen','recalled','allow')),
  note          text,
  created_at    timestamptz not null default now(),
  primary key (brand_id, serial_number)
);
create index if not exists idx_brand_serial_flags_serial on public.brand_serial_flags(serial_number);

-- Service-role only (the API uses the service client). No anon/auth policies — the registry rules are
-- not public; the per-item verdict is surfaced via items.brand / items.serial_status instead.
alter table public.brand_registry     enable row level security;
alter table public.brand_serial_rules enable row level security;
alter table public.brand_serial_flags enable row level security;

-- Persist the verdict on the item so the public provenance UI can show a brand-verified badge without
-- ever reading the rules. unregistered (default) | verified | rejected.
alter table public.items add column if not exists brand         text;
alter table public.items add column if not exists serial_status text not null default 'unregistered';

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_legal_documents.sql
-- ──────────────────────────────────────────────
-- Legal documents (Terms of Service, Privacy Policy). The admin uploads a PDF via /api/admin/legal; the
-- public /legal/* pages serve whatever URL is stored here (one row per kind). RLS enabled — all access
-- goes through the service-role client (public read via /api/legal, admin write via /api/admin/legal), so
-- default-deny is correct. Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists public.legal_documents (
  kind        text primary key check (kind in ('terms', 'privacy')),
  url         text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.legal_documents enable row level security;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_push_tokens.sql
-- ──────────────────────────────────────────────
-- Phase D1 — Native push token registry.
-- Stores APNs (iOS) and FCM (Android) device tokens so the server can send
-- targeted push notifications. A device may register before the user logs in
-- (wallet is null until they do). The primary key is (wallet, token) so the
-- same device can be re-registered under different wallets without duplicates,
-- and a single wallet can have multiple devices. Service-role only — no
-- anonymous or authenticated policies; the API writes via the service client.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists public.push_tokens (
  wallet      text,
  token       text      not null,
  platform    text,
  updated_at  timestamptz not null default now(),
  primary key (wallet, token)
);

create index if not exists idx_push_tokens_wallet on public.push_tokens(wallet) where wallet is not null;

alter table public.push_tokens enable row level security;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_rate_limits.sql
-- ──────────────────────────────────────────────
-- API rate limiting — durable, distributed fixed-window counter.
-- Serverless lambdas don't share memory, so an in-process counter only sees one instance's traffic. This
-- table + RPC give an atomic cross-instance count. src/lib/rate-limit.ts calls the RPC and falls back to
-- a per-instance in-memory window if this migration hasn't run, so protection degrades but never errors.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

-- One atomic hit: bucket now() into a fixed window, upsert-increment the key's counter, prune that key's
-- older windows, and report whether the caller is still under the limit. SECURITY DEFINER so it runs with
-- the table owner's rights (the service client calls it; no anon access to the table itself).
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_limit int)
returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Bounded cleanup: drop this key's expired windows so the table can't grow without limit.
  delete from public.rate_limits where key = p_key and window_start < v_window_start;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

alter table public.rate_limits enable row level security;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_merchants.sql
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- >>> migration_merchant_domain.sql
-- ──────────────────────────────────────────────
-- VisbyPay browser extension: verified merchant domain.
-- The extension brands a detected checkout as a Visby partner (and shows "Includes Visby NFT provenance")
-- ONLY when the page's domain exactly matches a merchant's verified `domain`. This must be exact and
-- admin-set — set this column for a merchant only after confirming they actually control the domain, so a
-- lookalike (nike.attacker.com) can never be promoted to partner. Used by /api/sdk/partner-check.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

alter table public.merchants add column if not exists domain text;

-- Bare host, normalized (no protocol / www / path / port), lowercased — e.g. 'shop.acme.com'.
create index if not exists idx_merchants_domain on public.merchants(domain) where domain is not null;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_connected_wallets.sql
-- ──────────────────────────────────────────────
-- Cross-chain wallets: a user can register several wallets (Solana / Ethereum / Bitcoin) and pick
-- which one keeps the Tallys they receive. `connected_wallets` is a JSONB array of
-- { id, chain, address, label? }; `tally_wallet` is the chosen destination address (empty = the
-- Visby embedded wallet). Both nullable — the UI falls back to a localStorage cache when absent.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

alter table public.profiles add column if not exists connected_wallets jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists tally_wallet text;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_sdk_mint_retry.sql
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- >>> migration_sdk_webhook_retry.sql
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- >>> migration_transfer_count.sql
-- ──────────────────────────────────────────────
ALTER TABLE items ADD COLUMN IF NOT EXISTS transfer_count integer NOT NULL DEFAULT 0;

-- ──────────────────────────────────────────────
-- >>> migration_analytics.sql
-- ──────────────────────────────────────────────
-- migration_analytics.sql
-- Run this in the Supabase SQL editor (project rwdwzigqtfezbyqkfqfx).
-- Adds denormalized view_count to items, an item_views log table, and an atomic
-- increment_item_view() RPC (PostgREST can't express col = col + 1 directly).
--
-- WHY RLS is enabled on item_views:
-- The project's anon key ships to the browser, so any table WITHOUT row level
-- security is publicly readable via the anon PostgREST endpoint. Analytics rows
-- (including viewer wallets) must never be exposed that way. All app access goes
-- through the service-role client, which BYPASSES RLS — so enabling RLS with no
-- policies yields default-deny for anon/authenticated while the server still works.
--
-- Idempotent: safe to re-run.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS view_count int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS item_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  viewer_wallet text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_views_item_created_idx
  ON item_views (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS item_views_viewer_wallet_idx
  ON item_views (viewer_wallet);

ALTER TABLE item_views ENABLE ROW LEVEL SECURITY;

-- Body written as a plain quoted string (not $$ dollar-quoting) so it survives copy/paste into the
-- SQL editor intact — a mangled $$ delimiter is the most likely reason an earlier run created the
-- table/column but silently skipped this function.
CREATE OR REPLACE FUNCTION increment_item_view(p_item uuid)
RETURNS void
LANGUAGE sql
AS 'UPDATE items SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_item';

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_profiles_rls.sql
-- ──────────────────────────────────────────────
-- profiles holds PII: ship_to (buyer home address), ship_from (seller address), connected_wallets /
-- tally_wallet (cross-chain wallet graph), payment_order. The app reads/writes profiles EXCLUSIVELY via
-- the service-role client (createServiceClient), which bypasses RLS — so enabling RLS with NO policies =
-- default-deny for the public anon key. This closes the direct PostgREST read
-- (GET /rest/v1/profiles?select=ship_to,connected_wallets with the public anon key) without affecting the
-- app. Mirrors migration_rls.sql. Idempotent: safe to re-run.

alter table public.profiles enable row level security;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_rls.sql
-- ──────────────────────────────────────────────
-- Visby security hardening — lock down tables that hold user / financial data so the browser-side
-- anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) cannot read or write them directly via PostgREST.
--
-- WHY: a live audit showed the anon key could read payout_settings (stripe_account_id + sellers'
-- crypto_wallet), reviews, notifications, reports, disputes, and blocks. A first attempt that only
-- ran `ENABLE ROW LEVEL SECURITY` did NOT close it (payout_settings was STILL anon-readable after),
-- which means either RLS was already enabled with a PERMISSIVE policy that allows anon reads, or the
-- statements were applied to the wrong project. This version is correct in both cases.
--
-- WHAT IT DOES: for each sensitive table, enable RLS AND drop every existing policy, leaving the table
-- with RLS on and NO policies = default-deny for anon/authenticated. The app is unaffected: every read
-- and write of these tables goes through the service-role client (src/lib/supabase/service), and the
-- service role BYPASSES RLS. Verified: the browser client @/lib/supabase/client has no importers, and
-- the only anon-key reader (src/server/routers/nft.ts) touches only items + ownership_history, which
-- are deliberately NOT in this list (public listings + provenance, with their own read policies).
--
-- Idempotent and safe to re-run. Run in the Supabase SQL editor for project rwdwzigqtfezbyqkfqfx.
-- DOUBLE-CHECK you are on project rwdwzigqtfezbyqkfqfx before running (a prior migration was once
-- applied to the wrong project).

DO $$
DECLARE
  tbl  text;
  pol  text;
  targets text[] := ARRAY['payout_settings','reviews','notifications','reports','disputes','blocks'];
BEGIN
  FOREACH tbl IN ARRAY targets LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    -- Drop any pre-existing (possibly permissive) policy so the table is strictly default-deny.
    FOR pol IN
      SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', tbl)::regclass
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ── Verify (run this SELECT after the DO block; expect rls_enabled=true, policy_count=0 for all 6) ──
-- SELECT c.relname AS table,
--        c.relrowsecurity AS rls_enabled,
--        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('payout_settings','reviews','notifications','reports','disputes','blocks')
-- ORDER BY 1;

-- ──────────────────────────────────────────────
-- >>> migration_rls_complete.sql
-- ──────────────────────────────────────────────
-- Default-deny RLS on the remaining sensitive tables. The app accesses these ONLY through the
-- service-role client (createServiceClient bypasses RLS), so enabling RLS with no policies blocks the
-- public anon key from reading them directly via PostgREST without affecting the app. This is now safe
-- for items/ownership_history because the old nft router that read them with the anon key was removed and
-- the anon supabase clients (lib/supabase/server.ts, client.ts) have zero importers. Mirrors
-- migration_rls.sql + migration_profiles_rls.sql. Run in the Supabase SQL editor. Idempotent.

do $$
declare t text;
begin
  foreach t in array array['items','orders','ownership_history','stripe_customers','sdk_orders','order_addresses','transfers']
  loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- Guard the webhook+confirm double-order race: one order per cleared PaymentIntent.
-- (If this errors on existing duplicates, dedup them first, then re-run.)
create unique index if not exists orders_stripe_payment_intent_key
  on public.orders (stripe_payment_intent)
  where stripe_payment_intent is not null;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_transfers_txhash.sql
-- ──────────────────────────────────────────────
-- Money-path review fix: one on-chain signature must confirm at most ONE transfer row. A partial unique
-- index on tx_hash among 'sent' rows makes that a hard DB guarantee (confirmTransfer also checks in
-- application code, but this closes the read/write race). Idempotent.

create unique index if not exists transfers_txhash_sent_uniq
  on public.transfers (tx_hash)
  where status = 'sent' and tx_hash is not null;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_onramp_fulfillments.sql
-- ──────────────────────────────────────────────
-- Phase 1.6 — On-ramp disbursement lock. The fulfilled flag on the Stripe PaymentIntent is
-- read-then-write, so two concurrent /api/onramp/fulfill calls for the same payment could BOTH pass the
-- check and BOTH send crypto (double-disburse). This table is the atomic claim: the primary key means
-- exactly one request wins the INSERT and disburses; everyone else sees the row and waits or returns the
-- recorded result. Service-role-only (RLS, no policies). Idempotent. Run in the Supabase SQL editor.

create table if not exists public.onramp_fulfillments (
  payment_intent_id text primary key,
  wallet            text not null,
  asset             text not null,
  status            text not null default 'disbursing'
                      check (status in ('disbursing','done')),
  token_amount      numeric,
  tx                text,
  created_at        timestamptz not null default now(),
  done_at           timestamptz
);
alter table public.onramp_fulfillments enable row level security;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────
-- >>> migration_transfer_atomic.sql
-- ──────────────────────────────────────────────
-- Phase 1.7 — Atomic transfer prepare. checkLimits() then recordPrepared() is two round-trips, so N
-- concurrent prepares could each read the same daily usage and all pass, blowing past the daily cap
-- (TOCTOU). This RPC does check + insert in ONE transaction, serialized per wallet+token by an advisory
-- lock, so the cap can never race itself. Definer-owned and service-role-only: the anon/authenticated
-- roles can neither call it nor see the transfers table. Idempotent. Run in the Supabase SQL editor.

create or replace function public.prepare_transfer_atomic(
  p_idempotency_key text,
  p_from_wallet     text,
  p_to_wallet       text,
  p_to_handle       text,
  p_token           text,
  p_amount          numeric,
  p_kind            text,
  p_per_tx          numeric,
  p_daily           numeric,
  p_pending_ttl_min integer default 15
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_used     numeric;
  v_id       uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;
  if p_amount > p_per_tx then
    return jsonb_build_object('ok', false, 'reason', 'per_tx_limit:' || p_per_tx);
  end if;

  -- Serialize concurrent prepares for the same wallet+token; released automatically at tx end.
  perform pg_advisory_xact_lock(hashtextextended(p_from_wallet || ':' || p_token, 0));

  select id into v_existing from transfers where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'id', v_existing, 'existing', true);
  end if;

  -- Same accounting as the app's dailyUsed(): everything 'sent' since UTC midnight counts; a 'pending'
  -- counts only while recent, so an abandoned prepare can't permanently eat the day's headroom.
  select coalesce(sum(amount), 0) into v_used
  from transfers
  where from_wallet = p_from_wallet
    and token = p_token
    and created_at >= timezone('utc', date_trunc('day', timezone('utc', now())))
    and (status = 'sent'
         or (status = 'pending' and created_at >= now() - make_interval(mins => p_pending_ttl_min)));

  if v_used + p_amount > p_daily then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit:' || p_daily);
  end if;

  insert into transfers (idempotency_key, from_wallet, to_wallet, to_handle, token, amount, kind, status)
  values (p_idempotency_key, p_from_wallet, p_to_wallet, p_to_handle, p_token, p_amount, p_kind, 'pending')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'existing', false);
exception when unique_violation then
  -- Two requests raced the same idempotency_key past the SELECT — return the winner's row.
  select id into v_existing from transfers where idempotency_key = p_idempotency_key;
  return jsonb_build_object('ok', true, 'id', v_existing, 'existing', v_existing is not null);
end;
$$;

revoke all on function public.prepare_transfer_atomic(text,text,text,text,text,numeric,text,numeric,numeric,integer) from public;
revoke all on function public.prepare_transfer_atomic(text,text,text,text,text,numeric,text,numeric,numeric,integer) from anon;
revoke all on function public.prepare_transfer_atomic(text,text,text,text,text,numeric,text,numeric,numeric,integer) from authenticated;
-- Revoking PUBLIC strips the default grant from everyone — explicitly restore the one caller allowed.
grant execute on function public.prepare_transfer_atomic(text,text,text,text,text,numeric,text,numeric,numeric,integer) to service_role;

NOTIFY pgrst, 'reload schema';
