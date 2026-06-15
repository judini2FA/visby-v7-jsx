-- Visby order lifecycle (Phase 4.1) — physical fulfillment on top of the NFT/payment layer.
-- The provenance NFT transfers to the buyer at payment (unchanged). An order tracks the physical
-- item: paid -> shipped -> delivered. The seller payout is released on the buyer's delivery
-- confirmation. Accessed server-side via the service-role client, so no RLS policies are required.
-- Idempotent: safe to run multiple times. Run in Supabase dashboard -> SQL Editor -> Run.

CREATE TABLE IF NOT EXISTS orders (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id          uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  buyer_wallet     text NOT NULL,
  seller_wallet    text NOT NULL,
  price_usdc       numeric(18,6),
  pay_method       text,                                  -- card | sol | eth | btc | usdc
  status           text NOT NULL DEFAULT 'paid'
                     CHECK (status IN ('paid','shipped','delivered','cancelled')),
  ship_name        text,
  ship_address     jsonb,                                 -- { line1, line2, city, state, postal, country }
  tracking_carrier text,
  tracking_number  text,
  payout_released  boolean NOT NULL DEFAULT false,
  nft_tx           text,                                  -- provenance transfer signature from payment
  created_at       timestamptz NOT NULL DEFAULT now(),
  shipped_at       timestamptz,
  delivered_at     timestamptz
);

CREATE INDEX IF NOT EXISTS orders_buyer_idx  ON orders(buyer_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_seller_idx ON orders(seller_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_item_idx   ON orders(item_id);
