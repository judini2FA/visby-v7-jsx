-- Phase 2.3 (buyer surface) — let a business choose WHICH pre-logged serials go on sale. A pending_serials
-- row is only surfaced in the marketplace / storefront when available=true AND price_usdc is set; the
-- business toggles this from the seller dashboard. Default false so bulk-logging inventory never
-- auto-publishes it. Idempotent. Run in the Supabase SQL editor.

alter table public.pending_serials add column if not exists available boolean not null default false;

-- Marketplace/storefront read path filters on (status='pending' AND available AND price set) — partial
-- index keeps that scan cheap as pending inventory grows.
create index if not exists idx_pending_serials_available
  on public.pending_serials (created_at desc)
  where status = 'pending' and available = true;

NOTIFY pgrst, 'reload schema';
