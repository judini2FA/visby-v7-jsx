-- SnapTrade brokerage connections: one row per wallet (a SnapTrade user can hold many brokerage links).
-- user_secret is a read credential for that user's brokerages — service-role writes only, RLS on, anon locked out.
create table if not exists public.snaptrade_users (
  wallet            text primary key,
  snaptrade_user_id text not null,
  user_secret       text not null,
  created_at        timestamptz default now()
);

alter table public.snaptrade_users enable row level security;
-- No policies: only the service-role key (server routes) can read/write. Anon/auth clients get nothing.
