-- Server-persisted payment-method order (the user's favorites order; index 0 = their default/Primary).
-- Stored as an array of method ids on the existing profiles row, so it follows the user across devices
-- and can be read by the VisbyPay SDK checkout to pre-select the buyer's default.
alter table public.profiles add column if not exists payment_order jsonb default '[]'::jsonb;
