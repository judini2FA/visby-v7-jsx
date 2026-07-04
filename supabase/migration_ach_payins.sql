-- Blueprint 4.4: durable single-flight guard for ACH bank-debit pay-ins.
-- Run in the Supabase SQL editor. ADDITIVE — new table only.
--
-- WHY: an ACH PaymentIntent sits in `processing` for 1–3 business days before it settles. Stripe's
-- idempotencyKey only dedupes for 24h, so without a durable record a buyer who re-submits on day 2
-- (page reload / second device) would trigger a SECOND real bank debit that never gets refunded. This
-- table records one in-flight ACH per (item, buyer) across the whole settlement window; the partial
-- unique index is the atomic single-flight lock.

create table if not exists ach_payins (
    id                 uuid primary key default gen_random_uuid(),
    payment_intent_id  text unique,
    item_id            text not null,
    buyer_wallet       text not null,
    status             text not null default 'processing'
                         check (status in ('processing', 'succeeded', 'failed', 'refunded')),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    -- 14 days: safely past the maximum ACH settlement + NSF/return window (~5 business days ≈ up to
    -- ~9 calendar days across holiday weekends), so a still-clearing debit is never treated as expired.
    -- Only ever matters for the orphan-heal path (rows with a NULL payment_intent_id); an attached
    -- claim is never expiry-reclaimed (see claimAchPayin).
    expires_at         timestamptz not null default (now() + interval '14 days')
);

-- The single-flight lock: at most ONE processing ACH per (item, buyer) at a time. A concurrent or
-- next-day re-submit hits this unique violation and is rejected instead of debiting the bank twice.
create unique index if not exists ach_payins_active_uniq
  on ach_payins (item_id, buyer_wallet) where status = 'processing';

create index if not exists ach_payins_pi_idx on ach_payins (payment_intent_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'ach_payins_updated_at') then
    create trigger ach_payins_updated_at
      before update on ach_payins
      for each row execute procedure update_updated_at_column();
  end if;
end $$;

-- Service-role only (money-moving metadata). RLS on with zero policies denies anon/authenticated.
alter table ach_payins enable row level security;

NOTIFY pgrst, 'reload schema';
