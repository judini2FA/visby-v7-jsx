-- Blueprint 5.6: SDK merchant payout settlement.
-- Run in the Supabase SQL editor. ADDITIVE columns on sdk_orders only.
--
-- Until now an SDK sale minted the BUYER's provenance NFT but never paid the MERCHANT their cut — the
-- buyer's payment landed in the Visby treasury and merchant_net_usd (already computed at checkout) was
-- never disbursed. This adds the payout state so the merchant is paid their net in USDC (1:1 USD, via
-- the treasury — src/lib/solana-fund.ts sendUsdcFromAuthority) to their merchant_wallet after the mint,
-- exactly-once, with a retry path for a failed transfer.

alter table sdk_orders add column if not exists merchant_payout_status text not null default 'pending';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sdk_orders_merchant_payout_status_chk') then
    alter table sdk_orders
      add constraint sdk_orders_merchant_payout_status_chk
      check (merchant_payout_status in ('pending', 'processing', 'paid', 'failed'));
  end if;
end $$;

alter table sdk_orders add column if not exists merchant_payout_tx text;
alter table sdk_orders add column if not exists merchant_payout_at timestamptz;
alter table sdk_orders add column if not exists merchant_payout_next_attempt_at timestamptz;
alter table sdk_orders add column if not exists merchant_payout_last_error text;

-- Sweep target: minted orders still owed a payout (pending from a pre-existing/pre-migration mint, or a
-- prior failed attempt due for retry).
create index if not exists sdk_orders_merchant_payout_due_idx
  on sdk_orders (merchant_payout_next_attempt_at)
  where merchant_payout_status in ('pending', 'failed');

NOTIFY pgrst, 'reload schema';
