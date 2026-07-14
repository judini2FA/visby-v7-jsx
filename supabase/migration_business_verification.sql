-- A7 — Business account verification. A profile only becomes a real business account (bulk serial
-- tools, self-shipping) after this table holds an approved row — the personal→business switch on
-- Settings submits into here as 'pending', an admin (or future auto-check) flips it to
-- 'approved'/'rejected'. Service-role-only table (RLS, no policies — mirrors migration_kyc.sql /
-- migration_merchants.sql). Idempotent.

create table if not exists public.business_verifications (
  id                uuid primary key default gen_random_uuid(),
  wallet            text not null,
  legal_name        text,
  ein               text,
  business_type     text,
  business_address  jsonb,
  website           text,
  doc_url           text,
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists business_verifications_wallet_idx on public.business_verifications (wallet);

-- RLS on with no policies = default-deny to the anon key that ships to the browser. The app reaches
-- these rows only through the service-role client, which bypasses RLS (same posture as merchants /
-- kyc_verifications).
alter table public.business_verifications enable row level security;

-- Self-shipping: a verified business can opt out of Visby's shipping flow and handle its own orders.
alter table public.profiles add column if not exists self_ship boolean not null default false;

NOTIFY pgrst, 'reload schema';
