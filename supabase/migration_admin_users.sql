-- Phase 8 — Admin RBAC. Replaces the static NEXT_PUBLIC_ADMIN_WALLETS env list with a DB-managed admin
-- roster so super-admins can grant/revoke admin status without a redeploy. Service-role-only (RLS, no
-- policies). Idempotent. Run in the Supabase SQL editor.
--
-- Roles: super_admin (everything + manage the admin team), finance (payouts/refunds/disputes),
-- moderator (reports/moderation/flagging), authenticator (item authentication / brand registry).
-- The env wallets (NEXT_PUBLIC_ADMIN_WALLETS) remain implicit super_admins (bootstrap), so a misconfigured
-- table can never lock you out of admin.

create table if not exists public.admin_users (
  wallet      text primary key,
  role        text not null default 'moderator'
                check (role in ('super_admin','finance','moderator','authenticator')),
  granted_by  text,
  granted_at  timestamptz not null default now()
);
alter table public.admin_users enable row level security;

-- ⚠️ SEED THE FIRST SUPER-ADMIN. If NEXT_PUBLIC_ADMIN_WALLETS is unset, this table is the ONLY source
-- of admins — so you MUST seed at least one super_admin here (or set that env var), otherwise no one
-- can use the moderation tools or grant other admins via /admin/team. Uncomment and use your wallet:
--
-- insert into public.admin_users (wallet, role) values ('YOUR_SOLANA_WALLET_ADDRESS', 'super_admin')
--   on conflict (wallet) do update set role = 'super_admin';

NOTIFY pgrst, 'reload schema';
