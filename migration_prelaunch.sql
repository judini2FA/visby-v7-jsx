-- Prelaunch waitlist + investor inquiries. Written only by server routes via the service role; RLS is
-- enabled with NO policies so anon/authenticated clients can neither read nor write these tables.

create table if not exists public.prelaunch_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  ref_code    text not null unique,
  referred_by text references public.prelaunch_signups(ref_code) on delete set null,
  source      text,
  interests   text[] not null default '{}',
  ip_hash     text,
  created_at  timestamptz not null default now()
);
alter table public.prelaunch_signups add column if not exists interests text[] not null default '{}';
create index if not exists prelaunch_signups_referred_by_idx on public.prelaunch_signups (referred_by);
create index if not exists prelaunch_signups_created_at_idx on public.prelaunch_signups (created_at);
alter table public.prelaunch_signups enable row level security;

create table if not exists public.investor_inquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  firm        text,
  message     text not null,
  ip_hash     text,
  email_sent  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists investor_inquiries_created_at_idx on public.investor_inquiries (created_at);
alter table public.investor_inquiries enable row level security;
