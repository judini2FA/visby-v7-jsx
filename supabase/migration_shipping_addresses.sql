-- Visby buyer address book (blueprint 7.4) — lets a buyer save MULTIPLE shipping addresses and pick
-- a default. Purely additive: profiles.ship_to (the single default checkout reads) is untouched by
-- this migration; the /api/buyer/addresses route keeps it in sync whenever the default changes.
-- Idempotent. Run in Supabase dashboard -> SQL Editor -> Run.

CREATE TABLE IF NOT EXISTS shipping_addresses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet     text NOT NULL,
  label      text,
  name       text,
  line1      text NOT NULL,
  line2      text,
  city       text NOT NULL,
  state      text NOT NULL,
  postal     text NOT NULL,
  country    text NOT NULL DEFAULT 'US',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipping_addresses_wallet_created_idx
  ON shipping_addresses (wallet, created_at);

-- Default-deny: no policies defined, so only the service-role key (server routes) can read/write —
-- matches the rest of the codebase's RLS posture for buyer-owned tables.
ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
