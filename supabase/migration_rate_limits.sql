-- API rate limiting — durable, distributed fixed-window counter.
-- Serverless lambdas don't share memory, so an in-process counter only sees one instance's traffic. This
-- table + RPC give an atomic cross-instance count. src/lib/rate-limit.ts calls the RPC and falls back to
-- a per-instance in-memory window if this migration hasn't run, so protection degrades but never errors.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

-- One atomic hit: bucket now() into a fixed window, upsert-increment the key's counter, prune that key's
-- older windows, and report whether the caller is still under the limit. SECURITY DEFINER so it runs with
-- the table owner's rights (the service client calls it; no anon access to the table itself).
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_limit int)
returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Bounded cleanup: drop this key's expired windows so the table can't grow without limit.
  delete from public.rate_limits where key = p_key and window_start < v_window_start;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

alter table public.rate_limits enable row level security;

NOTIFY pgrst, 'reload schema';
