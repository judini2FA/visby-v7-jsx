-- Buyer's saved default shipping address. Snapshotted onto each order at purchase (createOrder) so a
-- buyer never has to enter shipping on a separate post-purchase page — it comes from settings, or is
-- asked once at checkout and saved here. Idempotent. Run in Supabase dashboard -> SQL Editor -> Run.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ship_to jsonb;  -- { name, line1, line2, city, state, postal, country }
