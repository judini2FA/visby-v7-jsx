-- Legal documents (Terms of Service, Privacy Policy). The admin uploads a PDF via /api/admin/legal; the
-- public /legal/* pages serve whatever URL is stored here (one row per kind). RLS enabled — all access
-- goes through the service-role client (public read via /api/legal, admin write via /api/admin/legal), so
-- default-deny is correct. Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists public.legal_documents (
  kind        text primary key check (kind in ('terms', 'privacy')),
  url         text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.legal_documents enable row level security;

NOTIFY pgrst, 'reload schema';
