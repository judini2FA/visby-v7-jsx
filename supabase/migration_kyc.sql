-- Phase 6 — KYC / ID verification (Persona). Adds verification status to profiles + a per-inquiry audit
-- table. Selling (mint / list / relist) is gated on kyc_status='approved' ONLY when the single flag
-- NEXT_PUBLIC_KYC_REQUIRED=1 is set — so turning KYC on is a deliberate switch and existing sellers are
-- never instantly blocked until that flip. Service-role-only table (RLS, no policies). Idempotent.
--
-- ROLLOUT: run this migration, get Persona keys (PERSONA_API_KEY / PERSONA_WEBHOOK_SECRET /
-- PERSONA_KYC_TEMPLATE_ID, plus PERSONA_KYB_TEMPLATE_ID for business), point Persona's webhook at
-- /api/kyc/webhook, THEN set NEXT_PUBLIC_KYC_REQUIRED=1 (+ redeploy) to enforce. Until then the whole
-- flow is dormant/no-op: /api/kyc/start returns 503 without a key, and selling is ungated.

alter table public.profiles add column if not exists kyc_status text not null default 'unverified';
alter table public.profiles add column if not exists account_type text not null default 'personal';
alter table public.profiles add column if not exists kyc_verified_at timestamptz;

create table if not exists public.kyc_verifications (
  id           uuid primary key default gen_random_uuid(),
  wallet       text not null,
  account_type text not null default 'personal',
  provider     text not null default 'persona',
  inquiry_id   text,
  template_id  text,
  status       text not null default 'created',
  reason       text,
  raw          jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists kyc_verifications_wallet_idx on public.kyc_verifications (wallet);
create unique index if not exists kyc_verifications_inquiry_idx on public.kyc_verifications (inquiry_id) where inquiry_id is not null;
alter table public.kyc_verifications enable row level security;

NOTIFY pgrst, 'reload schema';
