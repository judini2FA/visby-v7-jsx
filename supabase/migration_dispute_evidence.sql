-- Visby dispute evidence capture (Phase 6.5) — buyers/sellers attach photos/docs to an open dispute,
-- and admins see all evidence + proof-of-delivery (from orders.tracking_*) when resolving. Additive
-- and idempotent — safe to run multiple times. Accessed server-side only via the service-role client
-- (src/lib/supabase/service), same as the `disputes` table itself, so RLS is enabled with NO policies
-- (default-deny for anon/authenticated — matches migration_rls.sql's posture for disputes).
-- Run in Supabase dashboard -> SQL Editor -> Run.

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id    uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  uploaded_by   text NOT NULL,                         -- wallet of the uploader
  role          text NOT NULL CHECK (role IN ('buyer','seller','admin')),
  file_url      text NOT NULL,
  file_type     text,                                  -- mime type, or 'image'/'pdf'
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispute_evidence_dispute_idx ON dispute_evidence(dispute_id, created_at);

ALTER TABLE dispute_evidence ENABLE ROW LEVEL SECURITY;

-- Default-deny: no policies are defined, so anon/authenticated (the browser's anon key) can neither
-- read nor write this table. All access goes through /api/disputes/evidence via the service role,
-- which BYPASSES RLS and enforces buyer/seller/admin authorization in application code.

NOTIFY pgrst, 'reload schema';
