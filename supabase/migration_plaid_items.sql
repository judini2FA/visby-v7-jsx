-- Plaid bank connections: one row per linked Item (a bank login).
-- access_token is a bank-read credential — service-role writes only, RLS on, anon locked out.
-- (Production: move access_token behind app-level encryption / a vault before going live.)
create table if not exists public.plaid_items (
  id               uuid primary key default gen_random_uuid(),
  wallet           text not null,
  item_id          text not null unique,
  access_token     text not null,
  institution_name text,
  created_at       timestamptz default now()
);

create index if not exists plaid_items_wallet_idx on public.plaid_items(wallet);

alter table public.plaid_items enable row level security;
-- No policies: only the service-role key (server routes) can read/write. Anon/auth clients get nothing.
