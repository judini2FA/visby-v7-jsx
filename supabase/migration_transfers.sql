-- Phase 7 — Send / receive money. Records non-custodial peer-to-peer and own-wallet crypto transfers.
-- Visby never holds user funds: the user's embedded wallet signs the on-chain transfer itself; this table
-- is the app-level ledger that powers recipient resolution, daily/per-tx limits, idempotency, and history.
-- Service-role-only (RLS, no policies). Idempotent.

create table if not exists public.transfers (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key text unique not null,
  from_wallet     text not null,
  to_wallet       text not null,
  to_handle       text,                              -- the username typed, when resolved from one
  token           text not null,                     -- 'SOL' | 'USDC'
  amount          numeric not null check (amount > 0),
  kind            text not null default 'p2p',       -- 'p2p' | 'self' (between the user's own wallets)
  status          text not null default 'pending',   -- 'pending' | 'sent' | 'failed'
  tx_hash         text,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz
);
create index if not exists transfers_from_idx on public.transfers (from_wallet, created_at desc);
create index if not exists transfers_to_idx   on public.transfers (to_wallet, created_at desc);
alter table public.transfers enable row level security;

NOTIFY pgrst, 'reload schema';
