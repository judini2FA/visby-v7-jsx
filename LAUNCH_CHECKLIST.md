# Visby — Launch Checklist

Single source of truth for everything that must happen before production. Generated 2026-06-24.
The app **runs today on devnet/test** with all of the below degrading safely until done.

> Convention (per memory): **Judah runs all SQL migrations** (in the Supabase SQL editor) and obtains
> all third-party keys. Code is written to fail-soft until each is in place.

---

## 1. Database migrations to run

Each file is idempotent (`add column if not exists` / `create table if not exists`). Run any not yet
applied; safe to re-run. Features stay inert / fall back to a local default until their migration lands.

| Migration | Unlocks |
|---|---|
| `migration_connected_wallets.sql` | **NEW** — cross-chain wallets + Tally Destination sync across devices (profiles.connected_wallets, tally_wallet). Until run: device-local localStorage only. |
| `migration_payment_order.sql` | Payment-method ordering / default (profiles.payment_order). |
| `migration_orders_received_lamports.sql` | Activates the crypto payout FX cap. |
| `migration_sdk_crypto.sql` | SDK crypto-balance checkout (pay_method, sol_signature, unique idx). |
| `migration_sdk_mint_retry.sql` | Durable re-mint for paid-but-failed SDK orders. |
| `migration_sdk_webhook_retry.sql` | Durable webhook re-delivery for Pay-with-Visby. |
| `migration_brand_registry.sql` | Brand serial registry + counterfeit gate + **Brand-verified badge** data. |
| `migration_rate_limits.sql` | Durable cross-instance API rate limiting. |
| `migration_push_tokens.sql` | Native push registration (Capacitor). |
| `migration_merchant_domain.sql` | Partner-domain verification for the extension (fail-closed). |
| `migration_transfer_count.sql` | **was mislocated** — relocated into supabase/; adds items.transfer_count (likely already applied in prod; run to be safe + for reproducibility). |
| `migration_profiles_rls.sql` | **NEW (security)** — enables RLS default-deny on profiles so the public anon key can't read PII (home address, wallet graph) via direct PostgREST. App uses the service client, so unaffected. |
| `migration_legal_documents.sql` | **NEW** — stores the admin-uploaded Terms/Privacy PDF URLs. Until run: `/admin/legal` upload fails (file stores, pointer doesn't), public pages show "being finalized". |

> Believed already applied (per memory): orders, reviews, trust, disputes, notifications, analytics,
> shipping, ship_to, fees, merchants, payment_dedup, social, stripe_customers, plaid_items,
> snaptrade_users, payout_settings, rls, profile_avatar. **Verify before launch.**

---

## 2. Third-party keys / accounts

### Blocking card-rail cutover
- **Business-domain email + DNS domain** (~$12/yr + Cloudflare Email Routing). Needed for **Rainforest Pay**
  signup (KYB), the production site, and transactional email. `visby.sol` (SNS) cannot do email or host the app.
- **Rainforest Pay** account + API keys → replaces Stripe as the card rail (interchange + 0.30%, no monthly fee).

### Feature keys (features built, inert until key present)
- **Carrier APIs** — UPS + FedEx + USPS account #s + keys → live shipping labels (today: manual fallback).
  See `SHIPPING_TODO.md` (also: swap the EasyPost account off the temporary payment method first).
- **CRON_SECRET** + Vercel cron → SDK mint-retry + webhook re-delivery sweeps.
- **Plaid / SnapTrade** production keys (sandbox keys present) → bank/brokerage tiles live.
- **SECRET_ENCRYPTION_KEY** — already generated + in `.env.local` (encrypts Plaid/SnapTrade secrets).

### Phase 5 (Fraud & Trust — not started)
- **Civic** (seller KYC + verified badge), **Chainalysis** (wallet screening pre-mint), NFC hardware/keys.

---

## 3. Platform config
- **Privy dashboard** — enable **Solana embedded wallets** (accounts currently can get ETH-only → checkout
  hangs / wallet shows empty intermittently). This is the top pre-launch reliability fix.
- **Capacitor** (local, needs Xcode + Android Studio): `cap add ios/android`, Apple ($99) + Play ($25) accounts,
  APNs/FCM, deploy the web app to `app.visby.me` (Capacitor is a remote-URL shell). See `mobile/SETUP.md`.

---

## 4. Devnet → mainnet cutover (code is devnet today)
- `NEXT_PUBLIC_HELIUS_RPC_URL` → mainnet RPC.
- `MINT_AUTHORITY_SECRET_KEY` / `MINT_AUTHORITY_ADDRESS` → a **funded mainnet** authority (no devnet airdrop on
  mainnet — fund it; `/api/mint` airdrop fallback is devnet-only).
- `NEXT_PUBLIC_TREASURY_WALLET` → mainnet treasury (holds buyer float, funds seller SOL payouts).
- **Stripe** → live keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`) —
  or skip if cutting straight to Rainforest.
- Replace devnet explorer links (`?cluster=devnet`) — they're built from the env, just confirm they point to mainnet.

---

## 5. Pre-launch hygiene
- ✅ **Transactional email** — built (`src/lib/email.ts` + `email-templates.ts`, Resend, fail-soft; recipients resolved from Privy). Wired to 7 settlement events. Inert until `RESEND_API_KEY` is set. (Add the key + verified domain for live send.)
- ✅ **Monitoring** — built (`src/lib/monitoring.ts`, provider-agnostic; `/api/health` env-presence check; `/api/cron/reconcile-settlements` flags stuck mints/payouts, in `vercel.json` every 15m). Console-only until `SENTRY_DSN` or `ALERT_WEBHOOK_URL` is set.
- ✅ **Legal** — built as admin **PDF upload** (no generated text): `/admin/legal` uploads Terms/Privacy PDFs (admin-gated); public `/legal/terms` + `/legal/privacy` serve them (or show "being finalized"); footer + menu links added. **Run `migration_legal_documents.sql`**, add your wallet to `NEXT_PUBLIC_ADMIN_WALLETS`, then upload the real docs once written with counsel.
- **`.env.local` never committed** — it holds the service-role key, Privy secret, mint authority, Stripe keys.

---

## 6. Security hardening (found by the 2026-06-25 launch audit — NOT keys/migrations)

**Fixed this session (code):**
- ✅ **PII leak** — `profiles.getProfile` did `select('*')`, exposing buyer home address (`ship_to`), `ship_from`, and the cross-chain wallet graph (`connected_wallets`/`tally_wallet`) to any anonymous visitor. Narrowed to public fields; private fields now served by the authed `/api/profile/private` route. (Also add `migration_profiles_rls.sql` to close the direct-PostgREST vector.)
- ✅ **Forge-provenance hole** — deleted the dead, unauthenticated `nft.recordMint/recordTransfer` tRPC router (zero callers; could rewrite DB ownership).
- ✅ **Mainnet explorer links** — the 5 hardcoded `?cluster=devnet` links are now env-driven (`src/lib/explorer.ts`); checklist §4's "just env" claim was wrong.

**Still open (code, NOT keys — recommend before launch):**
- ⚠️ **`/api/mint` is unauthenticated** — anyone can mint forged provenance NFTs / create listings as any wallet. Fix: add `callerOwnsWallet(owner_wallet)` + have the 2 callers send the Privy token. (Needs live auth testing.)
- ⚠️ **Private DM reads are unauthenticated** (`messages.getThread`/`getConversations` tRPC IDOR) — any caller can read any user's DMs + social graph. Fix: move reads behind authed REST, or add an auth context to tRPC.
- ⚠️ **`upsertProfile` unauthenticated** (tRPC) — profile defacement IDOR (no fund/asset redirect — that claim was a false positive). Fix with the same tRPC-auth wiring.
- ⚠️ **`/api/onramp/fulfill`** double-disburse race (no idempotency lock on the metadata `fulfilled` flag) + doesn't cross-check `pi.amount_received`. Devnet-valueless today; harden before mainnet (or moot if replaced by Rainforest).
- ⚠️ **CoinGecko price feed** — single unkeyed/uncached source across all payment paths; fail-soft (503 + retry), but add a short cache + fallback before high-volume mainnet.

**Verified NOT a problem (audit false positives):**
- `/api/onramp/faucet` is **already hardened** (mainnet 503 guard + `callerOwnsWallet` + IP & per-wallet rate limits) — the audit's "critical treasury drain" was fabricated against stale content.
- The PermanentTransferDelegate "god key" is the intended escrowless design; all real transfer paths are auth-gated.

---

_Built and verified this session (devnet): cross-chain Tally wallets (aggregate view, on-chain transfer between
your Solana wallets, mint-to-destination, server sync) · Brand-verified badge · dead-code cleanup. See memory
`cross-chain-wallets-vision`, `visby-superapp-plan`, `build-plan-status`._
