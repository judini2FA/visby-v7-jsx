-- OFAC sanctions screening (blueprint 6.4). Screens a seller's payout wallet against the OFAC SDN list of
-- designated crypto (Solana) addresses BEFORE releasing funds. Data is free public U.S. Treasury data,
-- refreshed nightly by /api/cron/refresh-ofac from the maintained 0xB10C feed — no vendor, no API key.
-- Service-role-only tables. Idempotent. Run in the Supabase SQL editor.

-- The blocklist: OFAC-designated addresses. Exact-match (base58 is case-sensitive — do NOT lowercase).
create table if not exists public.ofac_sanctioned_addresses (
  address    text primary key,
  asset      text not null default 'SOL',
  source     text not null default 'ofac-sdn',
  created_at timestamptz not null default now()
);
alter table public.ofac_sanctioned_addresses enable row level security;

-- Singleton refresh metadata — the payout screen fails CLOSED (holds payouts) if this is empty/stale,
-- so a broken refresh can never silently let funds through unscreened.
create table if not exists public.ofac_refresh_meta (
  id                int primary key default 1,
  last_refreshed_at timestamptz,
  address_count     int not null default 0,
  source            text,
  constraint ofac_refresh_meta_singleton check (id = 1)
);
insert into public.ofac_refresh_meta (id, address_count) values (1, 0) on conflict (id) do nothing;
alter table public.ofac_refresh_meta enable row level security;

-- Admin review queue: a payout blocked by an OFAC hit (or held because screening was unavailable) lands
-- here for a human to review. One row per order (unique) so retries don't pile up duplicates.
create table if not exists public.payout_holds (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique,
  seller_wallet   text not null,
  reason          text not null,                -- 'ofac_match' | 'screening_unavailable' | ...
  matched_address text,
  status          text not null default 'open', -- 'open' | 'cleared'
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     text
);
alter table public.payout_holds enable row level security;
create index if not exists idx_payout_holds_open on public.payout_holds (created_at desc) where status = 'open';

NOTIFY pgrst, 'reload schema';
