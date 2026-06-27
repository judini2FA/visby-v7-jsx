-- Phase 5 Chunk B — MFA step-up. Single-use replay store for step-up signatures (src/lib/step-up.ts).
-- The nonce is the PK, so a re-submitted signature collides (23505) and is rejected. Service-role-only
-- (RLS, no policies). Idempotent. Run in the Supabase SQL editor.
--
-- ROLLOUT (order matters — verifyStepUp now FAILS CLOSED if this table is missing):
--   1. Run THIS migration first. The replay store must exist before any step-up is enforced.
--   2. Then set ONE env var to turn step-up on: NEXT_PUBLIC_STEP_UP_ENFORCED=1. Both the client (signs +
--      attaches a proof) and the server (requires + verifies it, and requires the owner to have MFA
--      enrolled) read this same var, so they flip together. Because NEXT_PUBLIC_* is build-time-inlined
--      into the client bundle, flipping it REQUIRES a redeploy — which also updates the server runtime,
--      so the "server-on / client-off" (or inverse) outage is impossible.
--   Until the var is set, routes behave exactly as before (no signature prompt, no requirement).

create table if not exists public.step_up_used (
  nonce    text primary key,
  wallet   text not null,
  action   text not null,
  used_at  timestamptz not null default now()
);
create index if not exists step_up_used_at_idx on public.step_up_used (used_at);
alter table public.step_up_used enable row level security;

NOTIFY pgrst, 'reload schema';
