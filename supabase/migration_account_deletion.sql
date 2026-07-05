-- CCPA/GDPR account deletion (blueprint Phase 8). Adds a terminal 'deleted' lifecycle state to the
-- existing account_status column and a deleted_at timestamp. Deletion ANONYMIZES the profiles row
-- (nulls PII, sets account_status='deleted') rather than dropping it, so foreign keys and the public
-- provenance chain (orders, ownership_history, reviews) never break. Enforcement rides the existing
-- ban gate: getWorstStatus() maps 'deleted' -> 'banned', so a deleted account is fully locked out
-- everywhere a ban is already enforced. Idempotent. Run in the Supabase SQL editor.

alter table public.profiles add column if not exists deleted_at timestamptz;

-- Rebuild the status CHECK to allow 'deleted' (the original allowed only active/suspended/banned).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_account_status_check') then
    alter table public.profiles drop constraint profiles_account_status_check;
  end if;
  alter table public.profiles
    add constraint profiles_account_status_check
    check (account_status in ('active','suspended','banned','deleted'));
end $$;

NOTIFY pgrst, 'reload schema';
