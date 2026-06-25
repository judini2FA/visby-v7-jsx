-- Maps a user's wallet → their Stripe customer id, so saved cards persist and can be listed/charged.
-- Used by: /api/stripe/setup-intent (getOrCreateCustomer), /api/stripe/payment-methods, /api/stripe/charge-saved.
-- Was referenced in code but never created → saved cards silently orphaned. This backfills it.

create table if not exists public.stripe_customers (
  wallet             text primary key,
  stripe_customer_id text not null,
  created_at         timestamptz not null default now()
);

-- Holds the wallet↔Stripe link — keep it off the anon/public key. Service-role routes bypass RLS,
-- and we add NO policies, so the anon key cannot read or write it.
alter table public.stripe_customers enable row level security;
