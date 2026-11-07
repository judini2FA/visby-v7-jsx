-- /links document email gate: who asked for which document, and whether they said they're a student.
-- Service-role only, same as the rest of the hub (RLS on, no policies).

alter table public.hub_contacts add column if not exists is_student boolean;

create table if not exists public.hub_doc_requests (
  id          bigserial primary key,
  contact_id  uuid not null references public.hub_contacts(id) on delete cascade,
  visitor_id  uuid references public.hub_visitors(id) on delete set null,
  doc_id      text not null,
  is_student  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists hub_doc_requests_contact_idx on public.hub_doc_requests (contact_id);
alter table public.hub_doc_requests enable row level security;
