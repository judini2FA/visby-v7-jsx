-- Offers (blueprint 7.3). A buyer proposes a price on a listed item; the seller accepts/declines; an
-- ACCEPTED, unexpired offer lets THAT buyer check out at the offered price. The price is authorized
-- SERVER-SIDE: checkout re-reads the accepted amount from here (never trusts a client-supplied amount),
-- and only for the AUTHENTICATED buyer. Service-role-only. Idempotent.

create table if not exists public.offers (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete cascade,
  buyer_wallet  text not null,
  seller_wallet text not null,
  amount_usd    numeric(18,6) not null check (amount_usd > 0),
  status        text not null default 'pending'
                  check (status in ('pending','accepted','declined','expired','consumed','withdrawn')),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  expires_at    timestamptz,             -- set on acceptance; an accepted offer is time-boxed
  resolved_at   timestamptz              -- when declined/withdrawn/consumed/expired
);
alter table public.offers enable row level security;

-- At most ONE live (pending or accepted) offer per (item, buyer): re-offering replaces the prior one,
-- and a buyer can't stack. Enforced by a partial unique index.
create unique index if not exists offers_live_uniq
  on public.offers (item_id, buyer_wallet)
  where status in ('pending', 'accepted');

create index if not exists offers_item_idx   on public.offers (item_id, status);
create index if not exists offers_seller_idx on public.offers (seller_wallet, status, created_at desc);
create index if not exists offers_buyer_idx  on public.offers (buyer_wallet, status, created_at desc);

NOTIFY pgrst, 'reload schema';
