-- Visby social graph — follows / likes / messages.
-- Idempotent: safe to run multiple times. Apply in the Supabase dashboard → SQL Editor → Run.
-- These tables back the follow system, item likes, and seller messaging. The app reaches them
-- via the service-role client (server-side), so no RLS policies are required here.

-- ── Follows ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_wallet text NOT NULL,
  following_wallet text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(follower_wallet, following_wallet)
);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows(follower_wallet);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows(following_wallet);

-- ── Likes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wallet text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(item_id, wallet)
);
CREATE INDEX IF NOT EXISTS likes_item_idx ON likes(item_id);
CREATE INDEX IF NOT EXISTS likes_wallet_idx ON likes(wallet);

-- ── Messages ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_wallet text NOT NULL,
  to_wallet text NOT NULL,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  content text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_to_wallet_idx ON messages(to_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_from_wallet_idx ON messages(from_wallet, created_at DESC);

-- After running, PostgREST reloads its schema cache automatically within a few seconds.
-- If writes still report "Could not find the table ... in the schema cache", run:
--   NOTIFY pgrst, 'reload schema';
