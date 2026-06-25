-- Phase 5 — Brand serial-number registry.
-- Brands register the shape of their genuine serial numbers; at mint time a serial that *claims* to be
-- a registered brand (matches the brand's claim pattern) but falls *outside* its registered valid space
-- is rejected as a likely counterfeit, while a genuine one is stamped brand-verified. Serials that no
-- brand claims pass through untouched (generic goods are unaffected). Fail-open by design: if these
-- tables are absent or hold no active rules, every serial reads 'unregistered' and minting is unchanged.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create extension if not exists pgcrypto;

-- A registered brand identity. `verified` = Visby vetted that this party actually controls the brand
-- (drives whether the on-item badge should read "Brand-verified by <brand>").
create table if not exists public.brand_registry (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  display_name  text not null,
  verified      boolean not null default false,
  contact_email text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- How to recognize and validate a brand's serials.
--   claim_regex  : if a serial matches this, it PURPORTS to be from this brand (required).
--   valid_regex  : a genuine serial must ALSO match this tighter pattern (optional).
--   range_prefix : strip this prefix before the numeric range test (optional).
--   range_min/max: the serial's core must fall within [min, max] — numeric if both parse as ints,
--                  else lexical (optional). A rule with neither valid_regex nor a range treats every
--                  claim-matching serial as genuine (a brand asserting "this whole format is ours").
-- A claimed serial is GENUINE if it satisfies AT LEAST ONE active rule for the brand; if it claims the
-- brand but satisfies none, it is rejected. Regexes are admin-authored (trusted) — see the admin API.
create table if not exists public.brand_serial_rules (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brand_registry(id) on delete cascade,
  claim_regex  text not null,
  valid_regex  text,
  range_prefix text,
  range_min    text,
  range_max    text,
  is_active    boolean not null default true,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_brand_serial_rules_brand on public.brand_serial_rules(brand_id) where is_active;

-- Explicit per-serial overrides that beat the rules: 'revoked'/'stolen'/'recalled' force a reject even
-- if the ranges would pass; 'allow' force-verifies a one-off the ranges miss.
create table if not exists public.brand_serial_flags (
  brand_id      uuid not null references public.brand_registry(id) on delete cascade,
  serial_number text not null,
  flag          text not null check (flag in ('revoked','stolen','recalled','allow')),
  note          text,
  created_at    timestamptz not null default now(),
  primary key (brand_id, serial_number)
);
create index if not exists idx_brand_serial_flags_serial on public.brand_serial_flags(serial_number);

-- Service-role only (the API uses the service client). No anon/auth policies — the registry rules are
-- not public; the per-item verdict is surfaced via items.brand / items.serial_status instead.
alter table public.brand_registry     enable row level security;
alter table public.brand_serial_rules enable row level security;
alter table public.brand_serial_flags enable row level security;

-- Persist the verdict on the item so the public provenance UI can show a brand-verified badge without
-- ever reading the rules. unregistered (default) | verified | rejected.
alter table public.items add column if not exists brand         text;
alter table public.items add column if not exists serial_status text not null default 'unregistered';

NOTIFY pgrst, 'reload schema';
