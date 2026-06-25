-- Visby reviews & reputation (Phase 4.3) — buyers rate sellers after a delivered order.
-- A review is tied to a completed order (status = 'delivered'); the write path verifies the
-- caller is that order's buyer before inserting, so ratings can't be forged. Reputation
-- (avg + count) is aggregated on read. Accessed server-side via the service-role client, so no
-- RLS policies are required. Idempotent: safe to run multiple times.
-- Run in Supabase dashboard -> SQL Editor -> Run.

CREATE TABLE IF NOT EXISTS reviews (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- order_id is NOT NULL + CASCADE so it can never go NULL: Postgres treats NULLs as distinct in a
  -- UNIQUE constraint, which would otherwise let a buyer spam rows once an order was deleted.
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES items(id)  ON DELETE SET NULL,
  reviewer_wallet text NOT NULL,                       -- the buyer leaving the review
  seller_wallet   text NOT NULL,                       -- the seller being reviewed
  rating          int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- one review per order per reviewer; lets a buyer revise (upsert) their own review
  UNIQUE(order_id, reviewer_wallet)
);

CREATE INDEX IF NOT EXISTS reviews_seller_idx   ON reviews(seller_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_item_idx     ON reviews(item_id);
CREATE INDEX IF NOT EXISTS reviews_reviewer_idx ON reviews(reviewer_wallet);

-- After running, PostgREST reloads its schema cache automatically within a few seconds.
-- If writes still report "Could not find the table ... in the schema cache", run:
--   NOTIFY pgrst, 'reload schema';
