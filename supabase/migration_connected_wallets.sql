-- Cross-chain wallets: a user can register several wallets (Solana / Ethereum / Bitcoin) and pick
-- which one keeps the Tallys they receive. `connected_wallets` is a JSONB array of
-- { id, chain, address, label? }; `tally_wallet` is the chosen destination address (empty = the
-- Visby embedded wallet). Both nullable — the UI falls back to a localStorage cache when absent.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

alter table public.profiles add column if not exists connected_wallets jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists tally_wallet text;

NOTIFY pgrst, 'reload schema';
