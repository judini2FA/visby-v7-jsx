-- Drop Plaid + SnapTrade tables (blueprint 4.2).
-- These held sandbox-only data; bank linking is now Stripe Financial Connections only.

drop table if exists public.plaid_items;
drop table if exists public.snaptrade_users;

NOTIFY pgrst, 'reload schema';
