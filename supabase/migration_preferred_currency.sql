-- Adds profiles.preferred_currency so a user's chosen display currency persists server-side (survives an
-- app update / reinstall / new device, not just localStorage). The profiles router already reads + writes
-- this column (strip-on-missing until now). Display-only — settlement is always USDC/SOL. Idempotent.

alter table public.profiles add column if not exists preferred_currency text;

NOTIFY pgrst, 'reload schema';
