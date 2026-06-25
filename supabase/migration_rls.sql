-- Visby security hardening — lock down tables that hold user / financial data so the browser-side
-- anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) cannot read or write them directly via PostgREST.
--
-- WHY: a live audit showed the anon key could read payout_settings (stripe_account_id + sellers'
-- crypto_wallet), reviews, notifications, reports, disputes, and blocks. A first attempt that only
-- ran `ENABLE ROW LEVEL SECURITY` did NOT close it (payout_settings was STILL anon-readable after),
-- which means either RLS was already enabled with a PERMISSIVE policy that allows anon reads, or the
-- statements were applied to the wrong project. This version is correct in both cases.
--
-- WHAT IT DOES: for each sensitive table, enable RLS AND drop every existing policy, leaving the table
-- with RLS on and NO policies = default-deny for anon/authenticated. The app is unaffected: every read
-- and write of these tables goes through the service-role client (src/lib/supabase/service), and the
-- service role BYPASSES RLS. Verified: the browser client @/lib/supabase/client has no importers, and
-- the only anon-key reader (src/server/routers/nft.ts) touches only items + ownership_history, which
-- are deliberately NOT in this list (public listings + provenance, with their own read policies).
--
-- Idempotent and safe to re-run. Run in the Supabase SQL editor for project rwdwzigqtfezbyqkfqfx.
-- DOUBLE-CHECK you are on project rwdwzigqtfezbyqkfqfx before running (a prior migration was once
-- applied to the wrong project).

DO $$
DECLARE
  tbl  text;
  pol  text;
  targets text[] := ARRAY['payout_settings','reviews','notifications','reports','disputes','blocks'];
BEGIN
  FOREACH tbl IN ARRAY targets LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    -- Drop any pre-existing (possibly permissive) policy so the table is strictly default-deny.
    FOR pol IN
      SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', tbl)::regclass
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ── Verify (run this SELECT after the DO block; expect rls_enabled=true, policy_count=0 for all 6) ──
-- SELECT c.relname AS table,
--        c.relrowsecurity AS rls_enabled,
--        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('payout_settings','reviews','notifications','reports','disputes','blocks')
-- ORDER BY 1;
