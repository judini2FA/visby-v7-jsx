-- Money-path review fix: one on-chain signature must confirm at most ONE transfer row. A partial unique
-- index on tx_hash among 'sent' rows makes that a hard DB guarantee (confirmTransfer also checks in
-- application code, but this closes the read/write race). Idempotent.

create unique index if not exists transfers_txhash_sent_uniq
  on public.transfers (tx_hash)
  where status = 'sent' and tx_hash is not null;

NOTIFY pgrst, 'reload schema';
