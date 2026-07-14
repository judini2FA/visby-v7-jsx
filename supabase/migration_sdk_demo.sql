-- Burner SDK test storefront (/sdk/demo) — TEST-ONLY convenience table.
--
-- Real merchants never have their secret retrievable server-side: secret_key_hash is a one-way hash
-- (see src/lib/merchants.ts — getMerchantBySecretKey looks up by hash, there is no reverse lookup),
-- and the plaintext is shown to the merchant exactly once at creation time (src/app/api/merchant/route.ts).
-- The demo storefront needs to replay the REAL merchant checkout API (Authorization: Bearer sk_visby_...)
-- on every session without a human re-pasting a key, so this single-row table stashes the plaintext
-- secret for ONE dedicated "Visby Demo Shop" merchant, created once by /api/sdk/demo-session.
--
-- NEVER model a real merchant this way — this exists solely so Judah can exercise the SDK end-to-end
-- without standing up an external test site. RLS is service-role-only (no policies = default-deny to
-- the anon key); only src/app/api/sdk/demo-session/route.ts (service-role client) ever touches this.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.sdk_demo_config (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single row, enforced
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  secret      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sdk_demo_config ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
