CREATE TABLE IF NOT EXISTS likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wallet text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(item_id, wallet)
);
CREATE INDEX IF NOT EXISTS likes_item_idx ON likes(item_id);
CREATE INDEX IF NOT EXISTS likes_wallet_idx ON likes(wallet);
