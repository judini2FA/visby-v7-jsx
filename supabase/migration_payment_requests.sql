-- Phase 7b — Payment requests ("Request money"). A request is one user asking another to pay them; the
-- payer fulfills it through the normal non-custodial send flow, which then marks the request paid. Visby
-- never holds funds. Service-role-only (RLS, no policies). Idempotent.

create table if not exists public.payment_requests (
  id               uuid primary key default gen_random_uuid(),
  requester_wallet text not null,                     -- who is asking to be paid
  payer_wallet     text not null,                     -- who is asked to pay
  token            text not null default 'SOL',
  amount           numeric not null check (amount > 0),
  note             text,
  status           text not null default 'pending',   -- 'pending' | 'paid' | 'declined' | 'cancelled'
  transfer_id      uuid,                               -- the transfers row that fulfilled it
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists payment_requests_payer_idx     on public.payment_requests (payer_wallet, status, created_at desc);
create index if not exists payment_requests_requester_idx on public.payment_requests (requester_wallet, created_at desc);
alter table public.payment_requests enable row level security;

NOTIFY pgrst, 'reload schema';
