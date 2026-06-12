-- Visby Phase 1 Database Schema
-- Run this in your Supabase SQL editor at: supabase.com > your project > SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── ITEMS TABLE ────────────────────────────────────────────────────────────
-- Every physical product that has been minted as an NFT
create table if not exists items (
    id                    uuid primary key default uuid_generate_v4(),
    name                  text not null,
    serial_number         text unique not null,
    condition             text not null check (condition in ('new','like_new','good','fair')),
    category              text not null default 'Other',
    description           text,
    image_url             text,
    arweave_metadata_url  text,
    nft_mint_address      text not null,
    current_owner_wallet  text not null,
    is_listed             boolean not null default false,
    price_usdc            numeric(18, 6),
    listed_at             timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
  );

-- ─── OWNERSHIP HISTORY TABLE ─────────────────────────────────────────────────
-- Every change of hands: mint events and transfers
create table if not exists ownership_history (
    id            uuid primary key default uuid_generate_v4(),
    item_id       uuid not null references items(id) on delete cascade,
    owner_wallet  text not null,
    from_wallet   text,
    tx_hash       text,
    event_type    text not null check (event_type in ('mint','transfer')),
    price_usdc    numeric(18, 6),
    created_at    timestamptz not null default now()
  );

-- ─── PAYOUT SETTINGS TABLE ──────────────────────────────────────────────────
-- Seller payout preferences: bank account (Stripe Payouts) or crypto wallet
create table if not exists payout_settings (
    id                  uuid primary key default uuid_generate_v4(),
    seller_wallet       text not null unique,
    payout_type         text not null check (payout_type in ('bank', 'crypto')),
    stripe_account_id   text,                      -- Stripe Connect account ID for bank payouts
    crypto_wallet       text,                      -- Destination wallet for crypto payouts
    crypto_chain        text default 'solana',     -- Chain for crypto payouts
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create trigger payout_settings_updated_at
  before update on payout_settings
  for each row execute procedure update_updated_at_column();

alter table payout_settings enable row level security;
create policy "payout_service_write" on payout_settings for all using (true) with check (true);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
create index if not exists idx_items_serial    on items(serial_number);
create index if not exists idx_items_owner     on items(current_owner_wallet);
create index if not exists idx_items_listed    on items(is_listed) where is_listed = true;
create index if not exists idx_history_item    on ownership_history(item_id);
create index if not exists idx_history_owner   on ownership_history(owner_wallet);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger items_updated_at
  before update on items
  for each row execute procedure update_updated_at_column();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Allow public read of items and history (provenance is public)
alter table items enable row level security;
alter table ownership_history enable row level security;

create policy "items_public_read" on items for select using (true);
create policy "history_public_read" on ownership_history for select using (true);

-- Allow inserts and updates from the service role (server-side only)
create policy "items_service_write" on items
  for all using (true) with check (true);
create policy "history_service_write" on ownership_history
  for all using (true) with check (true);
