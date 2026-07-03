-- Blueprint 4.1 — Stripe Financial Connections bank linking (server foundation).
-- One row per bank account a wallet has linked via Stripe Financial Connections.
-- Service-role only: no anon/auth policies, RLS enabled with zero policies locks the table
-- to the service-role key (server routes bypass RLS). Idempotent: safe to run multiple times.
-- Additive only — does not touch stripe_customers, plaid_items, or any existing payment table.

create table if not exists public.linked_bank_accounts (
  id                uuid primary key default gen_random_uuid(),
  wallet            text not null,
  stripe_customer_id text,
  fc_account_id     text,
  institution_name  text,
  last4             text,
  status            text not null default 'active'
                      check (status in ('active', 'disconnected')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (wallet, fc_account_id)
);

create index if not exists linked_bank_accounts_wallet_idx on public.linked_bank_accounts (wallet);

alter table public.linked_bank_accounts enable row level security;
-- No policies: only the service-role key (server routes) can read/write. Anon/auth clients get nothing.

NOTIFY pgrst, 'reload schema';
