-- /links QR hub: first-party visitor analytics + identity consolidation. Written only by server routes via
-- the service role; RLS is enabled with NO policies so anon/authenticated clients can neither read nor write.

create table if not exists public.hub_contacts (
  id             uuid primary key default gen_random_uuid(),
  email          text unique,
  linkedin_url   text unique,
  name           text,
  company        text,
  title          text,
  sources        text[] not null default '{}',
  prior_records  text[] not null default '{}',
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint hub_contacts_has_key check (email is not null or linkedin_url is not null)
);
alter table public.hub_contacts enable row level security;

-- status: anonymous | returning | known_contact | provider_match | authenticated | conflict
create table if not exists public.hub_visitors (
  id           uuid primary key,
  contact_id   uuid references public.hub_contacts(id) on delete set null,
  status       text not null default 'anonymous',
  visits       integer not null default 0,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  vendor_optout boolean not null default false
);
create index if not exists hub_visitors_contact_idx on public.hub_visitors (contact_id);
alter table public.hub_visitors enable row level security;

create table if not exists public.hub_invites (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,
  label         text not null,
  contact_id    uuid references public.hub_contacts(id) on delete set null,
  uses          integer not null default 0,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.hub_invites enable row level security;

create table if not exists public.hub_sessions (
  id          uuid primary key,
  visitor_id  uuid not null references public.hub_visitors(id) on delete cascade,
  campaign    text,
  invite_id   uuid references public.hub_invites(id) on delete set null,
  referrer    text,
  device      text,
  browser     text,
  country     text,
  region      text,
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists hub_sessions_visitor_idx on public.hub_sessions (visitor_id);
alter table public.hub_sessions enable row level security;

-- type: visit | click
create table if not exists public.hub_events (
  id          bigserial primary key,
  visitor_id  uuid not null references public.hub_visitors(id) on delete cascade,
  session_id  uuid references public.hub_sessions(id) on delete cascade,
  type        text not null,
  link_id     text,
  campaign    text,
  created_at  timestamptz not null default now()
);
create index if not exists hub_events_created_idx on public.hub_events (created_at);
create index if not exists hub_events_visitor_idx on public.hub_events (visitor_id);
alter table public.hub_events enable row level security;

-- source: rb2b | warmly | google | prelaunch | invite
-- evidence: authenticated | first_party_record | provider_match | invite_used
create table if not exists public.hub_identity_matches (
  id           bigserial primary key,
  contact_id   uuid references public.hub_contacts(id) on delete cascade,
  visitor_id   uuid references public.hub_visitors(id) on delete set null,
  session_id   uuid references public.hub_sessions(id) on delete set null,
  source       text not null,
  evidence     text not null,
  email        text,
  captured_url text,
  payload      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists hub_identity_matches_contact_idx on public.hub_identity_matches (contact_id);
create index if not exists hub_identity_matches_visitor_idx on public.hub_identity_matches (visitor_id);
alter table public.hub_identity_matches enable row level security;

-- choice: accepted | declined | gpc
create table if not exists public.hub_consents (
  id          bigserial primary key,
  visitor_id  uuid references public.hub_visitors(id) on delete cascade,
  choice      text not null,
  created_at  timestamptz not null default now()
);
alter table public.hub_consents enable row level security;

-- Atomic visit counter so concurrent beacons can't lose increments.
create or replace function public.hub_touch_visitor(p_id uuid, p_new_session boolean)
returns table (visits integer, status text, contact_id uuid)
language sql security definer set search_path = public as $$
  insert into public.hub_visitors (id, visits) values (p_id, case when p_new_session then 1 else 0 end)
  on conflict (id) do update set
    visits = hub_visitors.visits + case when p_new_session then 1 else 0 end,
    last_seen = now(),
    status = case when hub_visitors.status = 'anonymous' and p_new_session then 'returning' else hub_visitors.status end
  returning hub_visitors.visits, hub_visitors.status, hub_visitors.contact_id;
$$;
revoke all on function public.hub_touch_visitor(uuid, boolean) from public, anon, authenticated;
