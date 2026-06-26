-- Phase 2 — Rating-on-delivery email. The review link is a stateless HMAC token (see
-- src/lib/review-token.ts: order_id + buyer_wallet + expiry signed with REVIEW_TOKEN_SECRET), so no
-- token row is stored. This column is a best-effort marker recording that the review-request email
-- went out at delivery — useful for a future resend/audit. Idempotent. Run in the Supabase SQL editor.
--
-- Also set the env var REVIEW_TOKEN_SECRET (32+ random chars) in the app environment; the whole
-- feature no-ops cleanly until it's present.

alter table public.orders add column if not exists review_request_sent_at timestamptz;

NOTIFY pgrst, 'reload schema';
