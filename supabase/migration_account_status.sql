-- Account moderation status (suspend / ban). Extends the counterfeit-takedown work: is_flagged was a
-- binary "hide + block selling"; account_status adds an explicit lifecycle an admin controls:
--   active     — normal.
--   suspended  — cannot SELL (mint/list/relist) or do sensitive writes; can still sign in, browse, buy.
--   banned     — fully locked out: every authenticated action is rejected.
-- Service-role-only table; enforced server-side. Idempotent. Run in the Supabase SQL editor.

alter table public.profiles add column if not exists account_status text not null default 'active';
-- Add the CHECK guardedly so re-running never errors if it already exists.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_account_status_check') then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active','suspended','banned'));
  end if;
end $$;

alter table public.profiles add column if not exists moderation_reason text;
alter table public.profiles add column if not exists moderated_at timestamptz;
alter table public.profiles add column if not exists moderated_by text;

-- Carry the existing binary flag forward: anyone already is_flagged becomes 'suspended' (never auto-ban).
update public.profiles set account_status = 'suspended'
  where coalesce(is_flagged, false) = true and account_status = 'active';

-- Cheap lookups for the enforcement path (only the non-active minority is indexed).
create index if not exists idx_profiles_account_status on public.profiles (wallet)
  where account_status <> 'active';

NOTIFY pgrst, 'reload schema';
