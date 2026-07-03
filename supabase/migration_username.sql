-- Phase 1.10 — Unique usernames. Unblocks unambiguous P2P "send by handle": display_name is not
-- unique, so resolveRecipient() (src/lib/transfers.ts) refuses to guess when >1 profile shares a
-- display_name. A username is unique (case-insensitively) and can be resolved with confidence.
-- Idempotent: safe to run multiple times. Apply in the Supabase dashboard -> SQL Editor -> Run.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- Case-insensitive uniqueness, but only enforced once a username is actually set.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON profiles (lower(username)) WHERE username IS NOT NULL;

-- Format guard: 3-20 chars, lowercase letters/digits/underscore (app normalizes to lowercase before
-- writing). DO-block guard so re-running the migration never errors if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_username_format_check
      CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
