-- Phase 1.6 — On-ramp disbursement lock. The fulfilled flag on the Stripe PaymentIntent is
-- read-then-write, so two concurrent /api/onramp/fulfill calls for the same payment could BOTH pass the
-- check and BOTH send crypto (double-disburse). This table is the atomic claim: the primary key means
-- exactly one request wins the INSERT and disburses; everyone else sees the row and waits or returns the
-- recorded result. Service-role-only (RLS, no policies). Idempotent. Run in the Supabase SQL editor.

create table if not exists public.onramp_fulfillments (
  payment_intent_id text primary key,
  wallet            text not null,
  asset             text not null,
  status            text not null default 'disbursing'
                      check (status in ('disbursing','done')),
  token_amount      numeric,
  tx                text,
  created_at        timestamptz not null default now(),
  done_at           timestamptz
);
alter table public.onramp_fulfillments enable row level security;

NOTIFY pgrst, 'reload schema';
