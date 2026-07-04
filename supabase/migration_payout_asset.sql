-- Blueprint 4.5: seller-preferred payout ASSET for the crypto rail.
-- Run in the Supabase SQL editor. ADDITIVE — one nullable-with-default column.
--
-- A crypto-rail seller can choose to be paid in the USDC stablecoin instead of volatile SOL. The net
-- (already in USD) maps 1:1 to USDC, so no price oracle / FX cap is needed — the treasury forwards USDC
-- directly (src/lib/solana-fund.ts sendUsdcFromAuthority). Cross-chain assets (ETH etc.) require a
-- mainnet swap and are intentionally NOT offered here yet. Bank-rail multi-currency is handled by
-- Stripe natively (a non-USD connected account converts USD on payout), so it needs no column.

alter table payout_settings add column if not exists payout_asset text not null default 'SOL';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payout_settings_payout_asset_chk') then
    alter table payout_settings
      add constraint payout_settings_payout_asset_chk check (payout_asset in ('SOL', 'USDC'));
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
