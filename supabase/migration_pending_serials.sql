-- Phase 2.2 — Business bulk serial logging. A business pre-logs the serials of genuine inventory as
-- PENDING (unminted) records; the Tally is minted only at point of sale (2.3), so a business never pays
-- to mint stock that hasn't sold. Kept as a SEPARATE table (not nullable items rows) so the items table's
-- hard NOT NULL invariants — nft_mint_address, current_owner_wallet — stay intact for every live listing.
-- Service-role-only (RLS, no policies). Idempotent. Run in the Supabase SQL editor.

create table if not exists public.pending_serials (
  id              uuid primary key default gen_random_uuid(),
  business_wallet text not null,
  serial_number   text not null,
  name            text not null,
  category        text,
  condition       text,
  description     text,
  image_url       text,
  brand           text,
  price_usdc      numeric(18,6),
  status          text not null default 'pending'
                    check (status in ('pending','minted','cancelled')),
  minted_item_id  uuid references public.items(id) on delete set null,
  created_at      timestamptz not null default now(),
  minted_at       timestamptz,
  -- A business can't log the same serial twice; the real items table separately enforces global serial
  -- uniqueness once minted.
  unique (business_wallet, serial_number)
);

create index if not exists idx_pending_serials_business on public.pending_serials(business_wallet) where status = 'pending';
create index if not exists idx_pending_serials_serial on public.pending_serials(serial_number);

alter table public.pending_serials enable row level security;

NOTIFY pgrst, 'reload schema';
