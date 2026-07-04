-- Blueprint 4.3: Stripe Connect seller payouts (fiat/bank rail)
-- Run this in your Supabase SQL editor: supabase.com > your project > SQL Editor
--
-- ADDITIVE ONLY. This does not touch payout_settings' existing columns or semantics.
--
-- Payout-preference field: payout_settings.payout_type ('bank' | 'crypto') already exists
-- (see migration_payout_settings.sql) and is the sole seller payout-preference store — there is
-- no `profiles` table in this schema. We reuse payout_type as-is: 'bank' == "pay me in fiat via
-- Stripe Connect", 'crypto' == existing SOL-to-wallet rail. No new column added to payout_settings.
--
-- This migration only adds a new table tracking the Stripe Connect Express account's onboarding
-- state (charges_enabled/payouts_enabled/details_submitted) per seller wallet, since that status
-- doesn't belong on payout_settings (it's account-verification state, not a preference).

create table if not exists seller_connect_accounts (
    wallet              text primary key,
    stripe_account_id   text,
    charges_enabled     boolean not null default false,
    payouts_enabled     boolean not null default false,
    details_submitted   boolean not null default false,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists seller_connect_accounts_stripe_account_id_idx
  on seller_connect_accounts (stripe_account_id);

-- Reuse the shared updated_at trigger function (already created by migration_payout_settings.sql /
-- schema.sql's update_updated_at_column()). Guard with a DO block so re-running this file is safe
-- even if the trigger already exists.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'seller_connect_accounts_updated_at'
  ) then
    create trigger seller_connect_accounts_updated_at
      before update on seller_connect_accounts
      for each row execute procedure update_updated_at_column();
  end if;
end $$;

-- RLS: service-role only, no policies (matches migration_kyc.sql's kyc_verifications convention).
-- RLS enabled with zero policies denies ALL access to anon/authenticated roles by default; the
-- service-role key used by our server routes bypasses RLS entirely, so this is effectively
-- "server-only" without needing an explicit auth.role() policy. This table holds Stripe Connect
-- account IDs and onboarding status — money-moving metadata — so no client should read/write it.
alter table seller_connect_accounts enable row level security;

-- Force PostgREST to reload its schema cache so the new table is visible immediately.
NOTIFY pgrst, 'reload schema';
