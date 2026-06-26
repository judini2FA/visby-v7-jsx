-- Default-deny RLS on the remaining sensitive tables. The app accesses these ONLY through the
-- service-role client (createServiceClient bypasses RLS), so enabling RLS with no policies blocks the
-- public anon key from reading them directly via PostgREST without affecting the app. This is now safe
-- for items/ownership_history because the old nft router that read them with the anon key was removed and
-- the anon supabase clients (lib/supabase/server.ts, client.ts) have zero importers. Mirrors
-- migration_rls.sql + migration_profiles_rls.sql. Run in the Supabase SQL editor. Idempotent.

do $$
declare t text;
begin
  foreach t in array array['items','orders','ownership_history','stripe_customers','plaid_items','sdk_orders','order_addresses','transfers']
  loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- Guard the webhook+confirm double-order race: one order per cleared PaymentIntent.
-- (If this errors on existing duplicates, dedup them first, then re-run.)
create unique index if not exists orders_stripe_payment_intent_key
  on public.orders (stripe_payment_intent)
  where stripe_payment_intent is not null;

NOTIFY pgrst, 'reload schema';
