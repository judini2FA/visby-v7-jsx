-- CART1 — Amazon-style persistent cart. One row per (account wallet, item) a shopper has queued to
-- buy. Linked to the ACCOUNT server-side (keyed off the Privy-authed wallet, never a client-supplied
-- one) so it survives refresh and follows the shopper across devices. A row is removed only when the
-- item is purchased or the shopper explicitly removes it — never on a timer. Completely separate from
-- the existing one-click "buy now" path, which never reads or writes this table.
-- Service-role only: RLS enabled with zero policies locks the table to the service-role key (server
-- routes bypass RLS) — matches migration_linked_bank_accounts.sql. Idempotent: safe to run multiple times.

create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  wallet     text not null,
  item_id    uuid not null references public.items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (wallet, item_id)
);

create index if not exists cart_items_wallet_idx on public.cart_items (wallet, created_at desc);

alter table public.cart_items enable row level security;
-- No policies: only the service-role key (server routes) can read/write. Anon/auth clients get nothing.

NOTIFY pgrst, 'reload schema';
