CREATE TABLE IF NOT EXISTS sol_payments (
  signature    text PRIMARY KEY,
  item_id      uuid,
  buyer_wallet text,
  created_at   timestamptz default now()
);
