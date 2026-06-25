-- FX cap for crypto payouts: record the SOL (lamports) the treasury actually received at purchase, so the
-- delivery-time payout can be capped at the seller's net share of it — the treasury never disburses more SOL
-- than it took in for an order (protects against SOL dropping between purchase and delivery confirmation).
-- Null for card/USD purchases (no SOL received → current-price conversion, bounded by the USD float).
alter table public.orders add column if not exists received_lamports bigint;
