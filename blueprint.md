# VISBY BLUEPRINT — Master Checklist

> **THIS FILE IS KING.** Fully read it at the start of every Claude Code session before doing anything else.
> It is the single source of what to do next and in what order. Work top-to-bottom within the current phase.
> A phase is done only when its **Gate** clears.
>
> **Update protocol:** when Judah gives a new build command, ask: *"update blueprint.md with this?"*
> Yes → update here AND memory.md. No → memory.md only. **Everything always goes to memory.md.**
> Check items off here the moment they're done; evidence and detail go in memory.md.

**Locked decisions (don't re-litigate):** KYC = Civic (swap Persona) · card-present = Moov (Rainforest dropped) · shipping = EasyPost (direct UPS/FedEx/USPS adapters retired) · fee = 9% marketplace / 3.5% SDK, $0.50 floor · bank linking = Stripe Financial Connections only (no Plaid/SnapTrade/pay-apps/brokerages) · Visby account = email + password + 2FA (seed phrases only when linking external wallets) · non-custodial always (Visby never holds funds) · burner card parked.

---

## Phase 0 — Turn on what's already built
- [x] 0.1 All pending migrations applied live via Composio 2026-07-03 (18-file bundle; verified 9/9 tables, 3/3 fns, all cols present)
- [x] 0.2 Seed Judah's wallet as super_admin (admin_users INSERT) — done 2026-07-03 via service role
- [ ] 0.3 Keys into env: CRON_SECRET ✓ · REVIEW_TOKEN_SECRET ✓ rotated locally (Judah: update in Vercel) · EASYPOST_API_KEY (test EZTK) — Judah · EMBEDDINGS_API_KEY — Judah · verify SENTRY_DSN + SECRET_ENCRYPTION_KEY in prod — Judah
- [ ] 0.4 Privy dashboard: enable Solana embedded wallets (fixes silent createWallet hang) — Judah
- [ ] 0.5 E2E-verify step-up MFA (needs a real logged-in session — Judah 2-min test), then flip `NEXT_PUBLIC_STEP_UP_ENFORCED=1` (KYC flag stays OFF until Phase 6)
- [x] 0.6 Verify PWA state — verified 2026-07-03: manifest.ts + sw.js + icons all present, SW registers in preview, installable
- **Gate:** migrations confirmed on prod, admin login works, a new account gets a Solana wallet, step-up enforced live.

## Phase 1 — Account & security backbone
- [x] 1.1 Visby account layer: email + password + 2FA — DONE 2026-07-03. Email/2FA/passkeys/app-lock/sessions already existed; added PASSWORD (account_security table + account-password.ts scrypt + 5 authed rate-limited routes + Settings UI). Judah's DECISION: HARD LOGIN GATE → `<PasswordGate>` wraps the app (providers.tsx): after Privy auth, no-password accounts must CREATE one, password accounts must ENTER it (per-session sessionStorage flag), forgot→email-code reset, sign-out escape always present. Verified: tsc clean, unauth pages pass through. ⚠️ DEPENDENCY: forgot-password emails via Resend → **Resend domain verification is now a LAUNCH BLOCKER** (else a forgotten password = lockout). NOTE: gate is client-side UX; a true server-enforced second factor (cookie/middleware) is a hardening follow-up.
- [x] 1.2 Seed-phrase UX — satisfied by current architecture (2026-07-03): native embedded wallet never surfaces a seed phrase (Privy MPC; "Export" is a muted advanced self-custody option), external wallet linking is address-only/watch-only, checkout advertises "No seed phrases." No seed-phrase-first UX anywhere.
- [x] 1.3 Auth: /api/mint requires Privy token + callerOwnsWallet — verified already built (2026-07-03)
- [x] 1.4 Fix DM read IDOR — verified already built (protectedProcedure + wallet check)
- [x] 1.5 Fix upsertProfile IDOR — verified already built (protectedProcedure + wallet check)
- [x] 1.6 /api/onramp/fulfill double-disburse idempotency lock — done + FULLY ENFORCED 2026-07-03 (onramp_fulfillments table live)
- [x] 1.7 Transfers daily-cap TOCTOU → atomic DB RPC — done + FULLY ENFORCED 2026-07-03 (prepare_transfer_atomic live)
- [x] 1.8 Keyed/multi-source price feed — done 2026-07-03: CoinGecko (optional COINGECKO_API_KEY) → Jupiter → Binance, all price sites re-railed onto the shared oracle
- [x] 1.9 Step-up on charge-saved (off-session saved-card on-ramp) — done 2026-07-03; DECISION: gate saved-card off-session charges (fresh-card buyer-present flow untouched); dormant until STEP_UP_ENFORCED=1
- [x] 1.10 Unique usernames — done + LIVE 2026-07-03 (profiles.username unique index; usernameAvailable proc; resolveRecipient username-first exact match; profile-edit UI field; verified end-to-end)
- [x] 1.11 Transfer confirm verifies amount+direction on-chain (transfers.ts confirmTransfer) + USDC transfers live (transfer-client.ts sendUsdc/sendSol) — verified already built 2026-07-03
- **Gate:** all listed routes reject unauth (401), password+2FA account flow works in preview, transfers hardened.

## Phase 2 — Provenance completeness
- [x] 2.1 QR code per item — done 2026-07-03: `<TallyQr>` (qrcode.react canvas → downloadable PNG) on item page, owner-gated; points at public /item/[id]. Verified render.
- [x] 2.2 Business bulk serial logging — done 2026-07-03: pending_serials table (live) + /api/business/bulk-serials (business-gated, hand-rolled CSV parser, upsert-ignore dupes) + seller-dashboard "Bulk log" tab (business only). Verified unauth→401.
- [x] 2.3 Mint-on-sale — FULLY DONE 2026-07-03 (engine + buyer surface, E2E-verified with live test data). ENGINE: settlePendingSerialSale (CAS pending→minted exactly-once → mint Tally to business → transfer to buyer → createOrder) + /api/business/buy-pending (sol-pay-grade verification, replay guard). BUYER SURFACE (Judah's decision = BOTH): available flag + publish/price controls in seller "Bulk log" tab (+ PATCH bulk-serials); getAvailablePending merges pending rows into the home grid (kind-tagged) AND a business storefront section on /p/[wallet] (account_type==='business'); PendingSerialCard → /business-item/[id] detail page → CheckoutModal mode='pending' (SOL-only) → buy-pending. E2E verified: published serial flows through getAvailablePending + storefront + detail API + page render; core marketplace (getListings) unbroken. RESIDUAL RISK (same class as sol-pay): buyer-paid-but-mint-failed + two-buyer-race reconcile via CRITICAL logs — consider an admin reconciliation queue (ties to 6.5). Non-SOL payment methods for pending buys = future (buy-pending is SOL-only today).
- [x] 2.4 Brand-verified badge UI — already built (BrandBadge component wired into item page; brand/serial_status fetched). Verified 2026-07-03.
- [x] 2.5 Counterfeit takedown — done 2026-07-03: is_flagged now ENFORCED at write-time (blocks mint /api/mint + list/relist /api/listing + listings.listForSale, fail-open on DB error); moderation flag_user also bulk-delists the seller's active listings. Serial-flag admin UI already existed.
- [x] 2.6 Provenance explainer — done 2026-07-03: extracted `<TallyExplainerCard>`/`<TallyExplainerInline>`; card on item page (identical render), inline on order-confirmation page.
- **Gate:** a business bulk-logs serials that stay unminted until each sells; a QR on a physical item opens its provenance.

## Phase 3 — Shipping & fulfillment (AtoShip — replaced EasyPost 2026-07-03)
- [x] 3.1 AtoShip key in; rate-shop live-tested (Austin→SF returned real UPS/USPS/FedEx rates) 2026-07-03
- [x] 3.2 Validated AtoShip response shapes against the REAL API (adapter src/lib/shipping/atoship.ts — docs said `rates`, real API is `data`; service_code null → deterministic slug)
- [x] 3.3 Delivery webhook DONE 2026-07-03: /api/shipping/webhook (HMAC + shared-secret verify, fail-closed) → shared finalizeDelivery(source:'carrier') → auto-confirm delivery + review email + payout; carrier delivery HOLDS payout if an open dispute exists. NEEDS: set SHIPPING_WEBHOOK_SECRET + register the URL in AtoShip dashboard + confirm AtoShip's real signature scheme.
- [ ] 3.4 Shipping insurance option at label purchase for high-value items — NOT done
- [x] 3.5 Direct UPS/FedEx/USPS adapters retired (git rm'd 2026-07-03)
- [ ] 3.6 Production billing: fund AtoShip wallet + swap to ak_live_ before live labels — Judah
- **Gate:** a test order ships with a real label and the delivery webhook auto-fires review email + payout. (Webhook code done; end-to-end live test pending AtoShip dashboard config.)

## Phase 4 — Money rails completion (non-custodial always)
- [ ] 4.1 Stripe Financial Connections: bank link + verification; wallet-page bank tiles re-railed onto it
- [ ] 4.2 Remove Plaid + SnapTrade (code, tables, keys)
- [ ] 4.3 Fiat payouts: Stripe Connect transfer to seller bank when bank = Primary method
- [ ] 4.4 ACH pay-in
- [ ] 4.5 Multi-currency auto-conversion: seller receives their preferred currency on payout
- [ ] 4.6 Moov card reader wired into checkout (card-present → same order state machine → Tally mint + payout)
- [x] 4.7 Order state machine — validator DONE 2026-07-03: src/lib/order-state-machine.ts (OrderStatus union + LEGAL_TRANSITIONS table faithful to every real orders.status write site + canTransition/assertTransition) + scripts/test-order-state-machine.mjs (31/31 pass) + TODO markers at the 4 write sites. Adversarially verified: table matches reality, no missing/wrong edges. Runtime enforcement is still the existing per-route CAS; wiring hard asserts at the TODOs is an optional reviewed follow-up. (sdk_orders is a SEPARATE state machine — out of scope.)
- [ ] 4.8 Cross-provider reconciliation job: Stripe + Moov + on-chain vs 9%/3.5% fee math; alert on drift
- [ ] 4.9 Stripe Tax (marketplace facilitator) behind a flag — enable when Judah confirms nexus/entity
- [ ] 4.10 1099-K seller reporting via Stripe Connect, behind a flag
- **Gate:** money moves and settles across all rails without Visby taking custody; every rail reconciles.

## Phase 5 — SDK & merchant experience
- [ ] 5.1 Merchant dashboard: orders/settlements list
- [ ] 5.2 Merchant dashboard: webhook delivery log + manual re-send
- [ ] 5.3 Merchant dashboard: revenue/fee breakdown
- [ ] 5.4 Extension: real Privy auth in popup
- [ ] 5.5 Extension-initiated partner checkout session
- [ ] 5.6 Merchant payout settlement wiring
- [ ] 5.7 SDK docs page: copy-paste quickstart polish
- **Gate:** a merchant can see every order, webhook, and dollar; extension completes a partner checkout end-to-end.

## Phase 6 — Fraud & trust stack
- [ ] 6.1 Civic KYC: swap Persona implementation (keep webhook-canonical fail-closed architecture + same sell gates)
- [ ] 6.2 Fix multi-wallet KYC propagation (verify on one wallet unlocks the user's other selling wallets safely)
- [ ] 6.3 Flip `NEXT_PUBLIC_KYC_REQUIRED=1` (sell gated, buy open)
- [ ] 6.4 Chainalysis wallet screening before mint/sale/payout (fail-closed on sanctioned; admin review queue)
- [ ] 6.5 Dispute evidence capture: photo/doc upload + proof-of-delivery attach + admin evidence view
- [ ] 6.6 Chargeback playbook: evidence bundle export (delivery + provenance trail) per order
- [ ] 6.7 NFC chip workflow (tag write/verify → item page) — after QR proves the loop
- [x] 6.8 Account suspend + ban — DONE 2026-07-03 (Judah request). profiles.account_status ('active'|'suspended'|'banned') live (is_flagged backfilled→suspended). account-status.ts (isBanned/isRestricted, fail-open). Enforced: tRPC protectedProcedure + all money routes (transfer/onramp) reject banned; mint + listing + listForSale reject suspended-or-banned. Moderation route: suspend_user/ban_user/reinstate_user (+ flag_user alias) with delisting + audit events. /api/account/status endpoint. Admin Users page: status badges + Suspend/Ban/Reinstate controls. Client AccountGate: banned=full-screen block+signout, suspended=dismissible banner; fails open. Verified: tsc clean, clean hydration, routes reject unauth (401/403). **OPERATIONAL: 13/13 live-DB checks passed 2026-07-03** — banned blocks all incl. money, suspended blocks selling not own funds, legacy is_flagged still restricts, fail-open on empty, ban_user delists live listings + reinstate reverses. Deployed to prod (9b302e5).
- **Gate:** unverified users can buy but not sell; sanctioned wallets blocked; a dispute carries evidence an issuer would accept; a banned account is locked out and a suspended one can't sell.

## Phase 7 — UX & "toddler-proof" experience
- [ ] 7.1 First-run onboarding walkthrough (what Visby is, what a Tally is, how paying works — zero jargon)
- [ ] 7.2 Empty + error states sweep: every screen has a helpful next action
- [ ] 7.3 Offers flow: preset offer slider → real accept → checkout at offered price
- [ ] 7.4 Address book (saved shipping addresses)
- [ ] 7.5 Order-tracking timeline UX
- [ ] 7.6 Help center: FAQ + contact-support flow wired to order state machine (self-heal email triage, injection-guarded)
- [ ] 7.7 Self-serve returns/refund request flow (feeds disputes; refund reflects on Tally provenance)
- [ ] 7.8 Notification preferences center (email/push toggles)
- [ ] 7.9 Seller analytics (views, likes, conversion) on seller dashboard
- [ ] 7.10 SEO/sharing: OG images for items + profiles
- [ ] 7.11 Fee transparency: seller sees 9% + shipping math before listing; buyer always sees final total before confirming
- **Gate:** a first-time non-crypto user completes signup → browse → buy → track without help or jargon.

## Phase 8 — Compliance & legal plumbing
- [ ] 8.1 CCPA/GDPR data-export endpoint
- [ ] 8.2 Account-deletion endpoint (wallet/provenance caveats explained plainly)
- [ ] 8.3 Seller/Marketplace Agreement + Acceptable Use routes (counsel supplies content; admin PDF-upload exists)
- [ ] 8.4 Company email aliases (Resend catch-all; needs Judah's domain DNS)
- [ ] 8.5 AML/KYC record-keeping hooks (screening results retained + exportable)
- **Gate:** a user can export or delete their data; all four legal routes live.

## Phase 9 — Platform delivery
- [ ] 9.1 Capacitor iOS/Android: local build steps (Xcode/Android Studio, dev accounts, APNs/FCM) — Judah + Claude
- [ ] 9.2 Extension store-readiness (icons, listing, honesty popups verified)
- [ ] 9.3 PWA verified installable (manifest, SW, icons, Lighthouse ≥ 90)
- **Gate:** app runs on a real phone; extension loads from a packed build; PWA installs.

## Phase 10 — DESIGN DEBUG & CLEANUP PREVIEW
- [ ] 10.1 Page-by-page sweep of every route against design.md (tokens only, type scale, S-grid, glass-nesting law, gradient budget, one focal point)
- [ ] 10.2 Light + dark parity audit
- [ ] 10.3 WCAG contrast measurements on worst-case translucent surfaces; reduced-motion/transparency honored
- [ ] 10.4 Kill visual drift: hardcoded colors, off-scale font sizes, emoji regressions, inconsistent radii
- [ ] 10.5 Before/after preview screenshots per page delivered to Judah; fix everything he flags
- **Gate:** Judah signs off on the screenshot review; zero design-rule violations remain.

## Phase 11 — TEST EVERYTHING + mainnet launch
- [ ] 11.1 Unit: fee math (9%/3.5%/floor), state-machine transitions, step-up crypto, serial-registry verdicts
- [ ] 11.2 Integration: Privy↔Supabase, mint↔Arweave↔Helius read-back, Stripe/Moov/EasyPost/Civic webhooks, SDK settle
- [ ] 11.3 E2E (Playwright): signup→wallet→mint+serial→list→buy (card & crypto)→ship→deliver→review→payout; SDK merchant journey; dispute/refund journey
- [ ] 11.4 Unhappy paths: RPC failure mid-action, double-submit, wrong wallet, insufficient funds, concurrent actions, canceled signing
- [ ] 11.5 Load: drop-spike on mint + checkout; Helius/Vercel/Supabase limits; cache hot reads
- [ ] 11.6 Security: threat-model review, dependency audit, external pentest prep, bug-bounty scoping
- [ ] 11.7 Staging (devnet + test keys) full regression
- [ ] 11.8 Mainnet closed beta: allowlisted, tiny real value, non-custodial verified with real money
- [ ] 11.9 Devnet→mainnet cutover: fund monitored mint wallet, pre-fund Arweave, live keys, explorer links
- [ ] 11.10 Multi-crypto mainnet enable: re-run `scripts/verify-payable-tokens.mjs`, wire Li.Fi execute() swap-pay, flip `NEXT_PUBLIC_MULTICRYPTO_ENABLED=1`
- [ ] 11.11 Launch-day smoke on mainnet: mint→serial→list→buy→confirm with a tiny real tx
- **Gate:** zero open S0/S1 bugs, one full lifecycle completed by a real buyer with real money, mainnet live.

---

## PARKED — do NOT build now
- Burner card (Lithic, regulated, PCI-scoped) — explicitly low priority, after core platform
- Novo business banking — custody-directive flag; needs attorney sign-off
- Coinbase Commerce — confirm with Judah before building (native SOL/USDC + Li.Fi may cover it)
- Basis Theory card vault — only at ~10k+ card sales/mo
- KMS mint-authority custody — revisit at Phase 11 (mainnet timeline)
