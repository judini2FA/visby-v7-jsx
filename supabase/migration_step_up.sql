-- Phase 5 Chunk B — MFA step-up. Single-use replay store for step-up signatures (src/lib/step-up.ts).
-- The nonce is the PK, so a re-submitted signature collides (23505) and is rejected. Service-role-only
-- (RLS, no policies). Idempotent. Run in the Supabase SQL editor.
--
-- After running this + deploying the client step-up flow, set env STEP_UP_ENFORCED=1 to make the
-- money-moving routes REQUIRE a step-up signature (until then they accept one if present but don't
-- require it, so nothing breaks during rollout).

create table if not exists public.step_up_used (
  nonce    text primary key,
  wallet   text not null,
  action   text not null,
  used_at  timestamptz not null default now()
);
create index if not exists step_up_used_at_idx on public.step_up_used (used_at);
alter table public.step_up_used enable row level security;

NOTIFY pgrst, 'reload schema';
