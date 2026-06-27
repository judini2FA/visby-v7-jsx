-- Phase 5 — Account security. Two service-role-only tables (RLS enabled, NO policies; accessed only
-- via createServiceClient, which bypasses RLS). Idempotent. Run in the Supabase SQL editor.
--
--  * device_sessions: app-side registry of where a user is signed in, for "active sessions / log out
--    other devices". Keyed on the STABLE Privy user_id (NOT a wallet — a user has multiple linked
--    wallets in an unstable order, so keying on a wallet silently mis-targets revocation). Privy owns
--    the real session; getAuthedContext (src/lib/auth.ts) rejects a revoked session_id, locking that
--    device out of the Visby API even while its Privy token is still valid. `fingerprint`
--    (hash of platform+user-agent) drives "new device" alerts so a re-login on the same device
--    doesn't re-alert.
--  * security_audit_log: append-only trail of sensitive events. Written fail-soft by
--    src/lib/security-audit.ts.

create table if not exists public.device_sessions (
  user_id       text not null,
  session_id    text not null,
  wallet        text,
  fingerprint   text,
  user_agent    text,
  platform      text,
  ip            text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  primary key (user_id, session_id)
);
create index if not exists device_sessions_user_idx on public.device_sessions (user_id, last_seen_at desc);
-- Hot path: getAuthedContext checks "is this session_id revoked?" on every authed request.
create index if not exists device_sessions_revoked_idx on public.device_sessions (session_id) where revoked_at is not null;
-- New-device detection: has this user seen this device fingerprint before?
create index if not exists device_sessions_fp_idx on public.device_sessions (user_id, fingerprint) where revoked_at is null;
alter table public.device_sessions enable row level security;

create table if not exists public.security_audit_log (
  id          uuid not null default gen_random_uuid() primary key,
  wallet      text not null,
  event       text not null,
  detail      jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists security_audit_wallet_idx on public.security_audit_log (wallet, created_at desc);
alter table public.security_audit_log enable row level security;

NOTIFY pgrst, 'reload schema';
