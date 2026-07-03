-- Phase 1.1 — Visby account password (the account-level credential layered over Privy email login).
-- The embedded wallet stays keyless MPC (no seed phrase); this password gates the ACCOUNT, not the wallet.
-- Keyed by the user's primary Solana wallet (same key as profiles). Service-role-only (RLS, no policies):
-- the password hash + reset-token hash are never reachable by the anon key. Idempotent. Run in the SQL editor.

create table if not exists public.account_security (
  wallet            text primary key,
  password_hash     text,          -- scrypt$<saltHex>$<hashHex>; null = no password set yet
  password_set_at   timestamptz,
  reset_token_hash  text,          -- sha256 of the emailed reset token; null when no reset is pending
  reset_expires_at  timestamptz,
  updated_at        timestamptz not null default now()
);

alter table public.account_security enable row level security;

NOTIFY pgrst, 'reload schema';
