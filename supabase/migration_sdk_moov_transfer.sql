-- SDK card payments run on Moov (not Stripe). Record the Moov transfer id on the order for auditability,
-- mirroring stripe_payment_intent (card) and sol_signature (crypto). The settle code writes it best-effort
-- and tolerates this column being absent, so applying this is non-blocking.
alter table public.sdk_orders add column if not exists moov_transfer_id text;
