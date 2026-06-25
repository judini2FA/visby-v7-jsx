-- migration_analytics.sql
-- Run this in the Supabase SQL editor (project rwdwzigqtfezbyqkfqfx).
-- Adds denormalized view_count to items, an item_views log table, and an atomic
-- increment_item_view() RPC (PostgREST can't express col = col + 1 directly).
--
-- WHY RLS is enabled on item_views:
-- The project's anon key ships to the browser, so any table WITHOUT row level
-- security is publicly readable via the anon PostgREST endpoint. Analytics rows
-- (including viewer wallets) must never be exposed that way. All app access goes
-- through the service-role client, which BYPASSES RLS — so enabling RLS with no
-- policies yields default-deny for anon/authenticated while the server still works.
--
-- Idempotent: safe to re-run.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS view_count int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS item_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  viewer_wallet text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_views_item_created_idx
  ON item_views (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS item_views_viewer_wallet_idx
  ON item_views (viewer_wallet);

ALTER TABLE item_views ENABLE ROW LEVEL SECURITY;

-- Body written as a plain quoted string (not $$ dollar-quoting) so it survives copy/paste into the
-- SQL editor intact — a mangled $$ delimiter is the most likely reason an earlier run created the
-- table/column but silently skipped this function.
CREATE OR REPLACE FUNCTION increment_item_view(p_item uuid)
RETURNS void
LANGUAGE sql
AS 'UPDATE items SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_item';

NOTIFY pgrst, 'reload schema';
