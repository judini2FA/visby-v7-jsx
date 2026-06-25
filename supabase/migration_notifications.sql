-- Visby in-app notifications. A notification is a tolerant, fire-and-forget side effect of a
-- lifecycle event (order sold/shipped/delivered, message, review, dispute, authentication) — the
-- helper that writes here (src/lib/notifications.ts) swallows every error, so a missing table or a
-- failed insert can NEVER break the settlement/lifecycle path that triggered it. Accessed
-- server-side via the service-role client, so no RLS policies are required.
-- Idempotent: safe to run multiple times. Run in Supabase dashboard -> SQL Editor -> Run.
-- Project: rwdwzigqtfezbyqkfqfx

CREATE TABLE IF NOT EXISTS notifications (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_wallet text        NOT NULL,
  type             text        NOT NULL,
  title            text        NOT NULL,
  body             text,
  link             text,
  data             jsonb,
  read             boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx    ON notifications (recipient_wallet) WHERE read = false;

-- Reload PostgREST's schema cache so the new table is queryable immediately.
NOTIFY pgrst, 'reload schema';
