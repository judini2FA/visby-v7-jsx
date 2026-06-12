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
