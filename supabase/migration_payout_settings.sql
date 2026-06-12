-- Phase 3.4: Add payout_settings table
-- Run this in your Supabase SQL editor: supabase.com > your project > SQL Editor

create table if not exists payout_settings (
    id                  uuid primary key default uuid_generate_v4(),
    seller_wallet       text not null unique,
    payout_type         text not null check (payout_type in ('bank', 'crypto')),
    stripe_account_id   text,
    crypto_wallet       text,
    crypto_chain        text default 'solana',
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create trigger payout_settings_updated_at
  before update on payout_settings
  for each row execute procedure update_updated_at_column();

alter table payout_settings enable row level security;
create policy "payout_service_write" on payout_settings for all using (true) with check (true);
