-- Phase 1.7 — Atomic transfer prepare. checkLimits() then recordPrepared() is two round-trips, so N
-- concurrent prepares could each read the same daily usage and all pass, blowing past the daily cap
-- (TOCTOU). This RPC does check + insert in ONE transaction, serialized per wallet+token by an advisory
-- lock, so the cap can never race itself. Definer-owned and service-role-only: the anon/authenticated
-- roles can neither call it nor see the transfers table. Idempotent. Run in the Supabase SQL editor.

create or replace function public.prepare_transfer_atomic(
  p_idempotency_key text,
  p_from_wallet     text,
  p_to_wallet       text,
  p_to_handle       text,
  p_token           text,
  p_amount          numeric,
  p_kind            text,
  p_per_tx          numeric,
  p_daily           numeric,
  p_pending_ttl_min integer default 15
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_used     numeric;
  v_id       uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;
  if p_amount > p_per_tx then
    return jsonb_build_object('ok', false, 'reason', 'per_tx_limit:' || p_per_tx);
  end if;

  -- Serialize concurrent prepares for the same wallet+token; released automatically at tx end.
  perform pg_advisory_xact_lock(hashtextextended(p_from_wallet || ':' || p_token, 0));

  select id into v_existing from transfers where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'id', v_existing, 'existing', true);
  end if;

  -- Same accounting as the app's dailyUsed(): everything 'sent' since UTC midnight counts; a 'pending'
  -- counts only while recent, so an abandoned prepare can't permanently eat the day's headroom.
  select coalesce(sum(amount), 0) into v_used
  from transfers
  where from_wallet = p_from_wallet
    and token = p_token
    and created_at >= timezone('utc', date_trunc('day', timezone('utc', now())))
    and (status = 'sent'
         or (status = 'pending' and created_at >= now() - make_interval(mins => p_pending_ttl_min)));

  if v_used + p_amount > p_daily then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit:' || p_daily);
  end if;

  insert into transfers (idempotency_key, from_wallet, to_wallet, to_handle, token, amount, kind, status)
  values (p_idempotency_key, p_from_wallet, p_to_wallet, p_to_handle, p_token, p_amount, p_kind, 'pending')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'existing', false);
exception when unique_violation then
  -- Two requests raced the same idempotency_key past the SELECT — return the winner's row.
  select id into v_existing from transfers where idempotency_key = p_idempotency_key;
  return jsonb_build_object('ok', true, 'id', v_existing, 'existing', v_existing is not null);
end;
$$;

revoke all on function public.prepare_transfer_atomic(text,text,text,text,text,numeric,text,numeric,numeric,integer) from public;
revoke all on function public.prepare_transfer_atomic(text,text,text,text,text,numeric,text,numeric,numeric,integer) from anon;
revoke all on function public.prepare_transfer_atomic(text,text,text,text,text,numeric,text,numeric,numeric,integer) from authenticated;
-- Revoking PUBLIC strips the default grant from everyone — explicitly restore the one caller allowed.
grant execute on function public.prepare_transfer_atomic(text,text,text,text,text,numeric,text,numeric,numeric,integer) to service_role;

NOTIFY pgrst, 'reload schema';
