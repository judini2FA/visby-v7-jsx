-- Phase 5.1 Trust & Safety — reports (moderation queue), user blocks, item authentication status.
-- Idempotent. Accessed server-side via the service-role client, so no RLS policies are required.
-- Run in the Supabase SQL editor (project rwdwzigqtfezbyqkfqfx) -> Run.

-- ── Reports / moderation queue ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_wallet text NOT NULL,
  target_type     text NOT NULL CHECK (target_type IN ('listing','seller','message')),
  target_id       text NOT NULL,                 -- item id | seller wallet | message id
  reason          text NOT NULL,                 -- reason code (e.g. 'counterfeit','prohibited','spam')
  details         text,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','reviewed','actioned','dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewed_by     text
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_type, target_id);

-- ── Blocks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_wallet text NOT NULL,
  blocked_wallet text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_wallet, blocked_wallet)
);
CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks(blocker_wallet);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks(blocked_wallet);

-- ── Item authentication status ───────────────────────────────────────────────
-- 'unverified' (default) | 'authenticated' (admin-confirmed genuine) | 'flagged' (suspected counterfeit)
ALTER TABLE items ADD COLUMN IF NOT EXISTS auth_status      text NOT NULL DEFAULT 'unverified';
ALTER TABLE items ADD COLUMN IF NOT EXISTS auth_note        text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS authenticated_at timestamptz;
ALTER TABLE items ADD COLUMN IF NOT EXISTS authenticated_by text;

NOTIFY pgrst, 'reload schema';
