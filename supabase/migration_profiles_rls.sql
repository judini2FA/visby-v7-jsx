-- profiles holds PII: ship_to (buyer home address), ship_from (seller address), connected_wallets /
-- tally_wallet (cross-chain wallet graph), payment_order. The app reads/writes profiles EXCLUSIVELY via
-- the service-role client (createServiceClient), which bypasses RLS — so enabling RLS with NO policies =
-- default-deny for the public anon key. This closes the direct PostgREST read
-- (GET /rest/v1/profiles?select=ship_to,connected_wallets with the public anon key) without affecting the
-- app. Mirrors migration_rls.sql. Idempotent: safe to re-run.

alter table public.profiles enable row level security;

NOTIFY pgrst, 'reload schema';
