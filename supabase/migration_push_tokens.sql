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
