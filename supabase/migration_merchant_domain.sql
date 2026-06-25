-- VisbyPay browser extension: verified merchant domain.
-- The extension brands a detected checkout as a Visby partner (and shows "Includes Visby NFT provenance")
-- ONLY when the page's domain exactly matches a merchant's verified `domain`. This must be exact and
-- admin-set — set this column for a merchant only after confirming they actually control the domain, so a
-- lookalike (nike.attacker.com) can never be promoted to partner. Used by /api/sdk/partner-check.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

alter table public.merchants add column if not exists domain text;

-- Bare host, normalized (no protocol / www / path / port), lowercased — e.g. 'shop.acme.com'.
create index if not exists idx_merchants_domain on public.merchants(domain) where domain is not null;

NOTIFY pgrst, 'reload schema';
