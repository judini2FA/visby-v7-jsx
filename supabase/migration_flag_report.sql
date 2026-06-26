-- Phase 1 — Flag / report extension.
--   * profiles.is_flagged: an admin "flag user" action sets this; the marketplace then hides that
--     seller's listings from public browse (enforced server-side in listings.dropFlaggedOwners).
--   * reports_open_dedup: stops a reporter from filing the same OPEN report on a target twice
--     (the API treats the resulting unique-violation as idempotent success).
-- Idempotent. Run in the Supabase SQL editor (project rwdwzigqtfezbyqkfqfx) -> Run.

alter table public.profiles add column if not exists is_flagged boolean not null default false;

create unique index if not exists reports_open_dedup
  on public.reports (reporter_wallet, target_type, target_id)
  where status = 'open';

NOTIFY pgrst, 'reload schema';
