CREATE TABLE IF NOT EXISTS follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_wallet text NOT NULL,
  following_wallet text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(follower_wallet, following_wallet)
);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows(follower_wallet);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows(following_wallet);
