-- VisbyPay SDK crypto checkout: let an sdk_order be paid from the buyer's Visby crypto balance.
-- pay_method distinguishes card vs crypto; sol_signature records the on-chain SOL transfer.
alter table public.sdk_orders add column if not exists pay_method    text default 'card';
alter table public.sdk_orders add column if not exists sol_signature text;

-- Replay guard (insert-first, no check-then-insert race): one signature can settle at most one order.
-- A replayed signature on a different order fails the claim with a unique violation (23505).
create unique index if not exists sdk_orders_sol_sig_uniq
  on public.sdk_orders(sol_signature) where sol_signature is not null;
