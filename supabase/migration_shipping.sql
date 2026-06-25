-- Visby shipping (Phase 4.2) — parcel + carrier-label fields for automatic shipping.
-- Shipping is rate-shopped at fulfillment (EasyPost) and the cost is deducted from the seller's
-- payout. Idempotent. Run in Supabase dashboard → SQL Editor → Run. ALTERs don't trigger RLS prompts.

-- items: parcel dimensions (for rate quotes) + the seller's chosen service preference
ALTER TABLE items ADD COLUMN IF NOT EXISTS weight_oz        numeric;
ALTER TABLE items ADD COLUMN IF NOT EXISTS length_in        numeric;
ALTER TABLE items ADD COLUMN IF NOT EXISTS width_in         numeric;
ALTER TABLE items ADD COLUMN IF NOT EXISTS height_in        numeric;
-- 'cheapest_2day' (default) | 'cheapest' | a specific "carrier:service" the seller picked
ALTER TABLE items ADD COLUMN IF NOT EXISTS ship_service_pref text DEFAULT 'cheapest_2day';

-- profiles: the seller's ship-from address (jsonb: name,street1,street2,city,state,zip,country,phone)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ship_from jsonb;

-- orders: the purchased label details; shipping_cost is what gets deducted from the seller payout
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost    numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_url        text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ep_shipment_id   text;
