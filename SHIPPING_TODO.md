# Shipping — PAUSED (not finished)

Status as of 2026-06-15. Automatic carrier shipping is **code-complete and reviewed but NOT live-tested.**
The app runs fine today: with no EasyPost key, fulfillment falls back to manual carrier + tracking entry.

## What's built (all gated behind `shippingConfigured()`)
- `src/lib/shipping.ts` — EasyPost rate-shop / pick-cheapest / buy-label / estimate.
- `src/app/api/orders/ship/route.ts` — `auto_label` mode: load buyer address + item parcel + seller
  ship-from → rate-shop → buy cheapest label within the listing's speed window → persist tracking,
  `label_url`, `shipping_cost`, `shipping_service`, `ep_shipment_id`. Manual path preserved.
- `src/app/api/seller/ship-from/route.ts` + `src/components/ship-from-settings.tsx` — seller return
  address (required before a label can be bought), shown in the seller Payouts tab.
- `src/app/api/shipping/config/route.ts` — boolean feature flag for the UI.
- `src/app/dashboard/page.tsx` — `FulfillRow` auto/manual toggle + handled rows show
  "Sale − shipping → You net $X" and a Print-label link (payout deduction surfaced).
- `src/app/api/shipping/estimate/route.ts` + `src/components/shipping-estimator.tsx` — listing-time
  estimate (local fallback today; live EasyPost rates once the key is set).
- DB: `supabase/migration_shipping.sql` (already run): items parcel/dims/ship_service_pref,
  profiles.ship_from, orders shipping_cost/shipping_service/label_url/ep_shipment_id.

## What remains to finish
1. Add an EasyPost **TEST** key to `.env.local` as `EASYPOST_API_KEY=EZTK...` (free, no card needed).
   Test mode returns real sample labels + tracking but charges/ships nothing.
2. Live-test the full chain: save a ship-from → on a paid order, "Buy label & ship" → confirm
   rate-shop returns rates, label buys, tracking + label_url fill, net payout shows.
3. Validate/adjust the EasyPost SDK response-shape assumptions in `shipping.ts` against the real API
   (the one thing that couldn't be verified offline).
4. Going to **production** (`EZPK...`) additionally requires a payment method on the EasyPost account.

## Account / billing — ACTION REQUIRED (2026-06-16)
- **The EasyPost account is currently on the WRONG / temporary payment info.** Before going live to
  production (buying real labels that charge real money), swap the EasyPost account's payment method to
  **Visby's own fund/treasury payment info** — i.e. the destination account where Visby's platform-fee
  revenue lands (per the earlier monetization decision). Do NOT ship production labels billed to the
  current payment method.
- Webhook the user provided (EasyPost tracking events) points at a **third party (WeSupply)**, not Visby:
  - URL: `https://easypost648020698649.webhooks.wesupply.xyz/easypost`
  - ID:  `hook_9d8f48746a0411f195bd097b113d593c`
  These do NOT feed Visby's app. If we want Visby to ingest EasyPost tracking (e.g. auto-confirm
  delivery), we must add a webhook receiver route in this app and point a NEW webhook at it.
- Still blocked on the actual **`EASYPOST_API_KEY`** (EZTK test / EZAK|EZPK prod) in `.env.local` — the
  webhook is not a substitute for the API key.

## Known caveat (raised with user)
"Cheapest" = cheapest label among the carriers EasyPost quotes (discounted commercial rates), not the
theoretical floor on postage. Seller listing copy was/should be framed as "best available rate."
