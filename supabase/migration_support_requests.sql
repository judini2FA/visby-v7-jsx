-- Visby help center (Phase 7.6) — contact-support submissions from the /help page. Service-role only:
-- the endpoint (/api/support/submit) uses createServiceClient, so no anon/auth policies are needed.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS support_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet     text,
  email      text NOT NULL,
  subject    text,
  message    text NOT NULL,
  order_id   text,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_requests_status_idx ON support_requests (status, created_at DESC);

-- Default-deny — matches disputes/moderation tables. No anon/auth policies; only the service-role
-- client (server routes) can read or write.
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
