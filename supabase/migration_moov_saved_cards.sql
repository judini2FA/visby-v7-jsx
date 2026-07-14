-- B1 wave3 — Moov saved cards for one-tap checkout.
-- One row per card a buyer has linked via Moov Card-Link Drop, written by /api/moov/charge only after
-- a charge on that card actually succeeds (so we never offer a card that doesn't work). moov_account_id
-- also lets /api/moov/card-token reuse the buyer's existing Moov account on a second card add instead
-- of spawning a fresh anonymous account every time. is_default is tracked here because Moov's card
-- resource has no default-card concept of its own; the most recently charged card becomes the default.
-- Service-role only: no anon/auth policies, RLS enabled with zero policies locks the table to the
-- service-role key (server routes bypass RLS) — same posture as linked_bank_accounts.
-- Additive only — does not touch any existing payment table. File only: NOT applied by this change.

create table if not exists public.moov_cards (
  id                uuid primary key default gen_random_uuid(),
  wallet            text not null,
  moov_account_id   text not null,
  card_id           text not null,
  brand             text,
  last4             text,
  exp               text,
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (wallet, card_id)
);

create index if not exists moov_cards_wallet_idx on public.moov_cards (wallet);

alter table public.moov_cards enable row level security;
-- No policies: only the service-role key (server routes) can read/write. Anon/auth clients get nothing.

NOTIFY pgrst, 'reload schema';
