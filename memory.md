# VISBY MEMORY — everything, always

> Companion to **blueprint.md** (the checklist king — fully read every session).
> This file is the append-everything record: current-state evidence, locked decisions with reasons,
> Judah's action items, and the log of every plan update. When Judah changes the plan, it ALWAYS lands here,
> and lands in blueprint.md only if he says yes when asked.

---

## Current-state snapshot (3-agent codebase audit, 2026-07-02)

### DONE — verified with evidence
- **Core infra**: Next.js 14 + Supabase + Privy + tRPC + RLS migrations (`src/server/trpc.ts`, `supabase/schema.sql`, 46 migration files)
- **Solana wallet via Privy**: `src/lib/wallet.ts` (known gap: some accounts get ETH-only embedded wallet → Privy dashboard toggle, blueprint 0.4)
- **Tally NFT mint**: Metaplex Core → Arweave metadata → Helius read-back (`src/app/api/mint/route.ts`, `src/lib/nft.ts`)
- **Listing + serial binding**: unique serial constraint, `getBySerial`, list/unlist (`src/server/routers/listings.ts`)
- **USDC buy/sell**: `src/lib/usdc.ts`, `src/app/order/[itemId]/page.tsx`, `/api/buy`
- **Photo cutout**: @imgly in-browser + fal.ai fallback + sharp alpha-enforce; transparent PNG enforced (`src/app/mint/page.tsx:71`) — old black-thumbnail bug fixed
- **Business/personal profiles**: `account_type` in profiles (`supabase/migration_kyc.sql`)
- **Marketplace**: browse/search/filter with AI semantic search → Orama BM25 → ilike chain (`src/server/lib/search-engine.ts`)
- **Provenance display**: `ownership_history` table + item-page trail (`src/app/item/[id]/page.tsx`)
- **Public profiles**: `/p/[wallet]` with ratings/verified badges
- **Seller dashboard**: mint + resell modes, shipping estimator, fee breakdown (`src/app/dashboard/seller/page.tsx`)
- **Reviews**: HMAC review tokens, email on delivery, `/review/[token]` (`src/lib/review-token.ts`)
- **Flag/report system**: reports table, is_flagged, admin queues (`supabase/migration_trust.sql`)
- **Admin console**: 12 pages, RBAC (super_admin/finance/moderator/authenticator), audit log (`src/lib/admin.ts`, `/admin/*`)
- **Stripe cards**: checkout sessions, saved cards, webhooks (`/api/stripe/*`)
- **Li.Fi multi-crypto**: SOL/USDC/ETH/BTC + 9 gated tokens, settles to USDC, 2% slippage (`/api/lifi/*`)
- **Price-view toggle**: USD/EUR/GBP/JPY/AUD/CAD/SOL/ETH/BTC, live rates (`src/lib/currency.ts`)
- **Crypto payouts**: SOL from treasury, FX-capped, idempotent (`src/lib/payout.ts`)
- **SDK (Pay with Visby)**: button.js custom element, hosted checkout, merchant API, HMAC webhooks with re-delivery backoff + cron, auto-mint with serial-registry gate (`public/sdk/v1/button.js`, `src/lib/sdk-settle.ts`, `src/lib/sdk-mint.ts`)
- **Send money**: non-custodial SOL transfers, prepare/confirm, limits (`/api/transfer/*`, `src/components/send-money.tsx`)
- **Wallet-methods manager**: drag-reorder, Primary = default = payout destination (`payment-methods-manager.tsx`)
- **KYC flow (on Persona — vendor being swapped to Civic)**: inquiry + fail-closed webhook + sell gates, dormant behind flag (`src/lib/persona.ts`, `src/lib/kyc.ts`)
- **Brand serial registry**: rules/ranges/flags, checked at mint + SDK checkout (`src/lib/serial-registry.ts`)
- **Disputes/escrow + refunds**: file claim → admin resolve → refund state machine (`/api/disputes/*`, `src/lib/refund.ts`)
- **Step-up MFA**: ed25519 action-bound signature + Privy MFA, fail-closed replay store, dormant until flag (`src/lib/step-up.ts`)
- **Face-ID app lock, device sessions, security audit log** (`src/lib/app-lock.ts`, `migration_security.sql`)
- **Emails**: Resend, 7 transactional templates, fail-soft (`src/lib/email.ts`)
- **Monitoring**: Sentry + alert router + self-heal triage queue with PR proposals (`src/lib/monitoring.ts`, `src/lib/self-heal.ts`)
- **Rate limiting**: durable RPC + in-memory fallback on mint/sol-pay/sdk-checkout (`src/lib/rate-limit.ts`)
- **Crons**: 5 in `vercel.json` (webhook redelivery, mint retry, reconcile detection, self-heal, embeddings), CRON_SECRET-gated
- **EasyPost shipping**: code-complete (rate-shop/buy-label/tracking, `src/lib/shipping.ts`) but NEVER live-tested — see SHIPPING_TODO.md; direct UPS/FedEx/USPS adapters also exist in `src/lib/shipping/` (being retired per decision)
- **Capacitor + MV3 extension**: scaffolded (remote-URL shell, honesty-enforced partner detection, fail-closed domain match)
- **Legal**: /legal/terms + /legal/privacy routes + admin PDF upload
- **Mainnet-readiness plumbing**: cluster env-driven, airdrop hard-blocked on mainnet, explorer links env-driven

### NOT done / partial (this is what blueprint.md phases cover)
- Visby account password + account-level 2FA (Judah spec 2026-07-02) → Phase 1
- Open security holes: /api/mint unauth, DM read IDOR, upsertProfile IDOR, onramp double-disburse race, unkeyed price feed, transfers TOCTOU → Phase 1
- QR/NFC linking, bulk serial CSV + mint-on-sale, takedown flow → Phase 2 (+6.7)
- EasyPost live test + delivery webhook receiver + insurance → Phase 3
- Financial Connections (Plaid/SnapTrade removal), fiat payouts/ACH, auto-conversion, Moov wiring, state-machine validator, cross-provider reconciliation, Stripe Tax, 1099-K → Phase 4
- Merchant dashboard beyond keys; extension auth + checkout → Phase 5
- Civic swap, Chainalysis, dispute evidence, chargeback bundles → Phase 6
- Onboarding, offers-to-checkout, address book, help center, self-serve returns, notification prefs, seller analytics, OG images → Phase 7
- Data export/delete, Seller Agreement + AUP, email aliases → Phase 8
- Capacitor local builds, extension packaging, PWA verify → Phase 9
- Design sweep → Phase 10 · Full test ladder + mainnet → Phase 11

---

## Locked decisions (with why)
| Decision | Why | Date |
|---|---|---|
| Non-custodial always — Visby never holds funds | Custody = money-transmitter licensing ($50k–$525k+/state); processors are merchant-of-record | standing |
| KYC = **Civic** (swap built Persona flow) | Judah's call reverting to build-map choice; keep the fail-closed webhook architecture, change vendor | 2026-07-02 |
| Card-present = **Moov** (Rainforest dropped) | Judah's call; Moov token/webhook infra already exists dormant | 2026-07-02 |
| Shipping = **EasyPost**; retire direct UPS/FedEx/USPS adapters | Judah's call; EasyPost code already complete, needs key + live test | 2026-07-02 |
| Fee = **9% marketplace / 3.5% SDK, $0.50 floor** | Implemented rates stand; the 2.5% in old docs is superseded | 2026-07-02 |
| Bank linking = **Stripe Financial Connections only** | "We can't get Plaid access — whatever Stripe connects to" (no pay-apps, no brokerages); remove Plaid + SnapTrade | 2026-07-02 |
| Visby account = email + **password** + 2FA; seed phrases only for linking external wallets | Judah: the account is "like any other"; native embedded wallets never expose phrases | 2026-07-02 |
| Burner card parked | Regulated (Lithic KYB, PCI), after core platform | standing |
| Coinbase Commerce = flagged, confirm before building | Native SOL/USDC + Li.Fi may already cover it | 2026-07-02 |
| Checklist = code items only | "One giant checklist prompt for claude code" — marketing/stores/legal-business live elsewhere | 2026-07-02 |
| Solana/Metaplex Core/Arweave/Helius/Privy/Supabase/tRPC/Vercel stack | Locked since blueprint; PoH chain per original vision | standing |

## Judah's I need you to do:
1. **Run pending Supabase migrations** (LAUNCH_CHECKLIST.md §1 ordered list + `migration_kyc.sql`, `migration_transfers_txhash.sql`, any stragglers) and confirm which already ran on prod.
2. **Seed your wallet as super_admin** — the commented INSERT in `migration_admin_users.sql` (wallet `HTLtPwmhgP7gEGQfECVxdudv6jdcsXtWa17Yga8qE5D`).
3. **Keys** → Vercel env: `CRON_SECRET`, fresh `REVIEW_TOKEN_SECRET`, `EASYPOST_API_KEY` (test `EZTK…`), `EMBEDDINGS_API_KEY` (Voyage free tier works); verify `SENTRY_DSN` + `SECRET_ENCRYPTION_KEY` set in prod.
4. **Privy dashboard**: enable Solana embedded wallets.
5. **Civic account** (replaces Persona) — sign up, get API keys when we reach Phase 6.
6. **EasyPost billing**: swap the account payment method to Visby's fund account before any production labels; the old webhook points at WeSupply (third party) — we'll add our own receiver in Phase 3.
7. **Domain DNS** for company email aliases (Phase 8.4) — Resend catch-all needs it.
8. **Later, decision-gated**: Stripe Tax nexus confirmation + entity/EIN for live keys; fintech attorney sign-off on the non-custodial structure before Phase 4 payouts + Phase 6 escrow changes; Apple/Google dev accounts for Phase 9.

## New commands from Judah (append-only log)
- **2026-07-02** — Session reset ("other chat hallucinated"). Ordered: build-map logged as checklist → superseded same day by: "entirely new plan from current state, original vision as main guide, UX-first, take liberties on marketplace needs, design-debug phase near end, final test-everything phase."
- **2026-07-02** — Five destinations: blueprint.md (checklist, fully read every session) + memory.md (everything, always) + design.md + two PDFs (checklist + design). Ask before updating blueprint.md; memory.md gets everything regardless.
- **2026-07-02** — Decisions: Civic KYC · Moov reader · EasyPost · 9%/3.5% fee stands · Financial Connections only (no Plaid) · account = email/password/2FA, seed phrases only for external wallet linking · checklist = code items only.
- **2026-07-02** — Judah checked the optifine skill folder for the new files. Resolution: repo root is the ONLY canonical home (blueprint.md / memory.md / design.md); the optifine folder's memory.md, context.md, design.md, agents.md were updated to be pointers to the repo files (plus a session-log line) so they can never drift into a second source of truth.
- **2026-07-02** — Judah: also ADD the new md files to the optifine folder. Done: synced copies now live there — `optifine/blueprint.md` (full copy of repo blueprint.md) + `optifine/visby-memory.md` (full copy of repo memory.md), each with a "synced copy — repo wins" banner. **Standing duty: whenever repo blueprint.md or memory.md changes, re-sync the optifine copies in the same turn.**
- **2026-07-02** — Judah (/skill-creator): edit the optifine skill for the new file types. Done: `optifine/SKILL.md` now documents `blueprint.md` + `visby-memory.md` in its file map (synced copies, repo wins, same-turn re-sync rule), the Session Start Protocol reads the master checklist before Visby build work, and the memory rule distinguishes the skill's own memory.md from visby-memory.md.
- **2026-07-03** — Judah: "ok, lets get started coding." Phase 0 verification + Phase 1 security batch done this session:
  - **Phase 0 audit (live DB probed via service role):** most migrations ran, but **12 never did** (kyc, brand_registry, legal_documents, push_tokens, rate_limits, merchants sdk_orders cols, merchant_domain, connected_wallets, sdk_mint_retry, sdk_webhook_retry, transfer_count, analytics fn). Bundled ALL pending SQL into **`supabase/PENDING_RUN_ME.sql`** — Judah pastes it ONCE into the Supabase SQL editor (idempotent). RLS verified holding (anon sees zero rows on a seeded admin_users). 0.2 DONE: seeded HTLtPwmhgP7gEGQfECVxdudv6jdcsXtWa17Yga8qE5D as super_admin via service role. 0.3 partial: CRON_SECRET present; REVIEW_TOKEN_SECRET rotated fresh in .env.local (burned value replaced — Judah must copy the new one to Vercel); EASYPOST_API_KEY + EMBEDDINGS_API_KEY still missing. 0.6 DONE: PWA verified in preview (manifest.ts serves, sw.js registers at root scope, icons 200) + manifest copy de-NFT'd ("Visby — Provenance Marketplace"). 0.5 blocked on a real logged-in session (Judah 2-min phone test) before flag flip.
  - **1.3/1.4/1.5 verified already built** (mint route callerOwnsWallet at src/app/api/mint/route.ts:51; messages + profiles routers use protectedProcedure + ctx.wallets checks; src/lib/auth.ts verifies Privy JWT, fails closed, checks session revocation). Blueprint had carried them as open from a stale audit.
  - **1.6 FIXED (real double-disburse race):** /api/onramp/fulfill read the Stripe `fulfilled` metadata flag then disbursed then wrote it — concurrent calls both disbursed. charge-saved had the same race (Stripe idempotencyKey returns the SAME succeeded PI to concurrent callers, then both disbursed). New `src/lib/onramp-disburse.ts`: atomic claim via INSERT into new `onramp_fulfillments` table (PK = payment_intent_id) → one winner disburses, losers get the recorded result or 409; lock released on send failure; degrades to legacy metadata guard until the migration runs. Both routes now share it. ALSO added auth to fulfill (callerOwnsWallet on the PI's wallet) — it was fully unauthenticated; buy-crypto page now sends the Privy Bearer token on both fulfill calls (CardPayForm got usePrivy).
  - **1.7 FIXED (TOCTOU):** new `prepare_transfer_atomic` RPC (migration_transfer_atomic.sql) — advisory-lock-serialized per wallet+token, cap check + insert in one transaction, same dailyUsed accounting (sent since UTC midnight + pending within 15-min TTL), service_role-only (PUBLIC/anon/authenticated revoked, service_role explicitly granted — revoking PUBLIC alone would have stripped service_role too, caught in review). `prepareAtomic()` in src/lib/transfers.ts calls it with fallback to the legacy two-step until migration runs; prepare route re-railed.
  - **1.8 DONE:** src/lib/price-oracle.ts upgraded — CoinGecko (optional `COINGECKO_API_KEY`, x-cg-demo-api-key header) → Jupiter (lite-api, SOL/USDC by mint) → Binance (SOL/ETH/BTC) with best-partial fallback + last-good cache for display, fresh-only-or-zeros for fund movement. Re-railed onto it: refund.ts, payout.ts, sdk-settle.ts, sol-pay (all fresh) + /api/price/sol + /api/price/rates (cached display).
  - **Verified:** tsc clean; live preview probes — /api/price/sol → 81.72, /api/price/rates → SOL/ETH/BTC populated, transfer/prepare unauth → 401, fulfill route functional. Both new migrations appended to PENDING_RUN_ME.sql (18 files, one paste).
- **2026-07-03** — Judah: "easypost failed on up but we switched to atoship, heres that key" (`ATOSHIP_API_KEY=ak_test_...` — saved to .env.local; Judah must also add it in Vercel for prod). **DECISION CHANGE: shipping = AtoShip (atoship.com), EasyPost dropped (their signup failed).** Blueprint-update question asked; memory records regardless:
  - AtoShip API (researched via 5-agent workflow + verified LIVE against the real API): base https://atoship.com/api/v1, Bearer auth; POST /rates {from_address,to_address,parcel} → {data:[{id,carrier,service,rate,delivery_days,...}]} (docs said "rates" key + service_code — REALITY: key is "data", service_code is null → adapter builds deterministic carrier_service slug); POST /labels {rate_id,...} buys; DELETE /labels/{id} voids (30-day window, wallet refund); GET /tracking/{n}; prepaid wallet (402 = top up). Parcel units default oz/inches — matches our columns exactly; Addr shape identical to ours (snake_case street1/zip).
  - **Test-key semantics (verified live): rates are REAL; label purchase is validation-only** ({sandbox:true, "request validated"}) — full ship flow needs ak_live_. Adapter surfaces an honest "test mode" error instead of a generic failure.
  - Code: new `src/lib/shipping/atoship.ts` (rates/buy/void, response unwrapping, carrier normalization, 6x4x4 dim fallback); `shipping.ts` re-railed onto AtoShip as sole provider (same exports — zero caller changes); **direct UPS/FedEx/USPS adapters RETIRED (git rm'd — blueprint 3.5 done)**; Carrier union += 'DHL'; BoughtLabel += label_id; orders.ep_shipment_id now stores the AtoShip lbl_ id for future voids (column keeps its legacy name).
  - Verified: tsc clean; live rates Austin→SF direct AND through /api/shipping/estimate (source:"live", $26.24 UPS 2nd Day Air picked by the 2-day recommender); /api/shipping/config → enabled:true; label request format validated by AtoShip sandbox.
  - Still Judah: fund/keep the AtoShip account, swap in ak_live_ + Vercel env at launch (replaces the old EasyPost billing-swap item). Webhook receiver (blueprint 3.3) still to build — AtoShip has webhooks; signature scheme docs were thin, revisit when building it.
- **2026-07-03** — Judah gave Composio (MCP tool router) + switched model to Opus, directive: "code everything in the checklist without stopping; use the checklist like a prompt; go in order; bug-fix + preview as you go; Sonnet subagents for coding, Opus only for thinking/preview/bugfix." Autonomous orchestration run — Phase 0 finished + Phase 1 nearly complete:
  - **Composio Supabase is LIVE** (project rwdwzigqtfezbyqkfqfx, account "visby"). Ran the 18-file PENDING_RUN_ME bundle as a tracked migration `visby_pending_bundle_20260703` — **Phase 0.1 DONE** (verified 9/9 new tables, all cols, 3/3 fns). This also FULLY ENFORCED 1.6 (onramp_fulfillments) + 1.7 (prepare_transfer_atomic). RLS + all Phase 2-8 tables now exist in prod. I can now run migrations myself via Composio (show SQL, apply, verify) — no more paste-to-Judah for DB.
  - **1.9 step-up on charge-saved** (Sonnet subagent): DECISION = gate off-session SAVED-card on-ramp charges with MFA step-up (fresh-card buyer-present flow untouched); new onrampChargeAction() builder; dormant until STEP_UP_ENFORCED=1. tsc clean.
  - **1.10 unique usernames** (Sonnet subagent + my fix): profiles.username (unique lower() index + format check, migration applied live), usernameAvailable proc, upsertProfile 23505→CONFLICT, resolveRecipient username-first. I FIXED a money-routing bug the subagent left: it matched usernames via the underscore-STRIPPED `safe` string (usernames allow `_`) → rewrote to exact `.eq('username', lower(raw))` on the format-validated raw handle. Verified live: free→available, short→rejected. Profile-edit UI field added.
  - **1.2 seed-phrase UX**: assessed SATISFIED by architecture — native embedded wallet never surfaces a seed phrase (Privy MPC; "Export" is a muted advanced self-custody button), external linking is address-only/watch-only, checkout says "No seed phrases." No code change; documented.
  - **1.1 account password** (the only missing piece of email+password+2FA — email/2FA/passkeys/app-lock/sessions already exist in security-settings.tsx): I wrote the security-critical parts myself — `src/lib/account-password.ts` (scrypt hash/verify timing-safe + emailed reset tokens sha256) + `account_security` table (applied live). Sonnet subagent building the 5 routes (/api/account/security, password/set, password/verify, password/reset/request, password/reset/confirm) + Settings→Security UI. Additive, non-breaking over Privy (email-OTP stays primary login → no lockout risk). NOTE for Judah: whether the password becomes a HARD login/app-open gate vs an optional additive credential is a follow-up UX decision — built as additive for safety.
  - 1.3/1.4/1.5/1.11 = verified already built. **Phase 1 essentially complete** pending 1.1 subagent verify.
  - New memory [[composio-tool-router]]: Judah wants Composio connect-links for any service need (he clicks once, I execute) — never hand him manual steps.

- **2026-07-03 (cont.)** — Autonomous run continued: **Phase 2 provenance COMPLETE** (all via Composio-applied migrations + Sonnet subagents, Opus review/preview):
  - Migrations applied live via Composio: pending_serials, account_security, username (all verified present).
  - **2.1 QR**: `<TallyQr>` (qrcode.react canvas→PNG download) owner-gated on item page → public /item/[id].
  - **2.2 bulk serials**: pending_serials table + /api/business/bulk-serials (business-gated via /api/kyc/status account_type, hand-rolled CSV parser, upsert-ignore dupes) + seller-dashboard "Bulk log" tab (business-only).
  - **2.3 mint-on-sale ENGINE** (Opus-reviewed money path): src/lib/pending-serial-sale.ts settlePendingSerialSale (CAS pending→minted exactly-once → mint to business → transfer to buyer → createOrder) + /api/business/buy-pending (payment verification REPLICATED field-for-field from sol-pay: treasury received, signer==buyer, fresh-oracle-priced within 2% slippage, sol_payments replay guard). Additive — sol-pay/mint routes untouched. RESIDUAL RISK flagged (same class as sol-pay): mint-fail-after-pay + two-buyer-race reconcile via CRITICAL logs; buyer ENTRY-POINT (storefront/listing model) is an OPEN UX DECISION, engine ready to wire.
  - **2.4 brand badge**: already built (BrandBadge on item page) — verified.
  - **2.5 takedown**: is_flagged now ENFORCED at write-time (blocks /api/mint + /api/listing + listings.listForSale, fail-open on DB error) + moderation flag_user bulk-delists the seller's listings.
  - **2.6 explainer**: `<TallyExplainerCard>`/`<TallyExplainerInline>` extracted; card on item page (identical), inline on order page.
  - Verified: full tsc clean; item/order/seller pages render 200 no-errors; all new routes reject unauth/invalid (401/400/404).
  - **Two OPEN DECISIONS for Judah** (defaults chosen, non-blocking): (1) 1.1 password = additive credential (chose non-lockout) vs hard app-open/login gate; (2) 2.3 buyer storefront model for pending serials. Phases 0+1+2 all done this session.
- **2026-07-03 (cont.)** — Judah answered the two decisions: (1) password = **HARD LOGIN GATE** (not additive); (2) 2.3 buyer entry = **BOTH unified normal listings AND a dedicated business storefront that REPLACES the profile page**.
  - **Password hard login gate BUILT**: `src/components/password-gate.tsx` wraps `<AppLock>` in providers.tsx. After Privy auth: no-password accounts get a mandatory "Create password" screen (rolls out to all existing users incl. Judah on next login); password accounts get "Enter password" (verified via /api/account/password/verify), session-remembered per-wallet in sessionStorage, cleared on logout. Forgot→emailed-code reset; "Sign out" escape on every screen. Fails closed on error but never traps. tsc clean, unauth pages pass through. ⚠️ **Resend domain verification is now a LAUNCH BLOCKER** (forgot-pw email must deliver or a forgotten password = lockout). Gate is client-side UX (real boundary stays Privy-auth on each API route); server-enforced 2nd factor = hardening follow-up.
  - **NEXT (in progress): 2.3 buyer surface** — pending serials must appear in normal marketplace listings AND a business storefront replacing /p/[wallet] profile. Large marketplace read-path change; buying a pending serial → /api/business/buy-pending (mint-on-sale engine already built).
  - **2.3 buyer surface BUILT + E2E-verified** (3 parallel Sonnet agents, disjoint files): (A) publish controls — `available` col (live) + PATCH /api/business/bulk-serials (business-gated, can't publish without price) + seller "Bulk log" per-row price input + publish toggle (LIVE/PENDING badges); (B) unified grid + storefront — listings.getAvailablePending (status=pending+available+priced, flagged-seller-excluded, kind-tagged) merged into home grid (search-suppressed for now, pending not in search chain) + business storefront section on /p/[wallet] when account_type=business + profiles.getProfile now returns account_type + new PendingSerialCard→/business-item/[id]; (C) detail+buy — /api/pending-serial/[id] (only surfaces available rows) + /business-item/[id] page (mirrors item page, no false 'verified' badge pre-mint) + CheckoutModal mode='pending' (SOL-only, swaps endpoint→buy-pending + id→pending_serial_id, item-mode untouched, onSuccess routes to real minted item_id). VERIFIED E2E via Composio-seeded test business+serial: flows through getAvailablePending + storefront + detail API + page; core getListings unbroken (3 normal listings still returned); test data cleaned up. **Phase 2 100% complete.** Applied live via Composio: migration_pending_serials_available.
- **2026-07-03 (cont.)** — Judah: "make all my tasks into Composio-links so you do them yourself." He'd already connected **vercel + resend** (plus supabase) on Composio. Cleared his to-do list via Composio:
  - **Vercel env vars SET by me** on project `visby-v7-jsx` (prj_HcafGXsng1YQIyxunUOoEGOfGZNo): REVIEW_TOKEN_SECRET (rotated value) + ATOSHIP_API_KEY (encrypted, prod+preview+dev, upsert). Take effect on next deploy.
  - **Resend `visby.me` = already VERIFIED** → the earlier "Resend domain = launch blocker" for the password gate is CLEARED; reset emails will deliver. (visby.me DNS is on Cloudflare/external, not Vercel.)
  - **Privy Solana embedded-wallet toggle = the ONLY remaining manual task** — NO Composio Privy toolkit exists (search falls back to Supabase auth). Judah must flip it in the Privy dashboard.
  - EMBEDDINGS_API_KEY / COINGECKO_API_KEY still need Judah to fetch a key value from the provider (Voyage free / OpenAI); then I place it in Vercel + .env.local. See [[composio-tool-router]] confirmed-capabilities.
- **2026-07-03 (cont.)** — Privy Solana wallet hang: Judah checked the dashboard → **Solana auto-create IS already enabled** (both embedded-wallet auto-create SVM + external Solana network). So the dashboard was never the cause — told him leave it, don't toggle. Real root cause = CODE: `EnsureSolanaWallet` (providers.tsx) called `useSolanaWallets().createWallet()` gated only on Privy's top-level `ready`, not the Solana hook's OWN `ready` — calling it pre-init hung silently (and `.catch(()=>{})` swallowed it). FIXED: gate on `solanaReady`, treat "already has wallet" as benign, surface other errors via captureError (client console), clear attempt-flag to retry. Installed Privy is 1.99.1 (not 1.80). tsc clean, app renders. **Needs Judah's live fresh-signup test** to confirm a new account gets a Solana wallet. See [[privy-solana-wallet-gap]].
- **2026-07-03 (cont.)** — Judah: Voyage key + "privy check, deploy vercel, keep going Phase 3, try every integration, asking is last resort." Done:
  - **AI search LIVE**: Voyage key set (local + Vercel), pointed EMBEDDINGS_BASE_URL=https://api.voyageai.com/v1 + MODEL=voyage-3.5-lite (1024-dim). Backfilled 3/3 items. VERIFIED semantic: "something to wear on my feet" → matched the Sneakers listing (zero keyword overlap).
  - **DEPLOYED to production** (commit 2b56524 then b65a4b2) via git push main → Vercel auto-deploy → **live on visby.me**. Smoke-tested: home/login/marketplace 200, price feed + getListings serve real data.
  - **CRITICAL BUG found via the Privy browser check + FIXED**: account-password.ts ran `promisify(node crypto.scrypt)` at module load; PasswordGate (client, wraps whole app) imported it → crashed EVERY page's client hydration in the 2b56524 deploy. Fixed: extracted pure passwordProblem/constants → `src/lib/password-rules.ts` (no crypto); client imports from there. Redeployed (b65a4b2). LESSON: curl SSR + tsc do NOT catch client-hydration crashes — do a browser render check before deploying client changes.
  - **Privy check PASSED** (browser, localhost): /login renders, "Sign in with Visby" opens the Privy modal (email + wallet options), no errors. Full new-signup→Solana-wallet still wants one real OTP login (Judah's MFA test covers it).
  - **Phase 3 shipping**: 3.1/3.2/3.5 already done (AtoShip live-tested, direct adapters retired). **3.3 delivery webhook DONE**: /api/shipping/webhook (HMAC+shared-secret, fail-closed) → shared finalizeDelivery helper (buyer vs carrier; carrier delivery HOLDS payout on open dispute). Needs SHIPPING_WEBHOOK_SECRET + AtoShip dashboard webhook registration to go live. 3.4 insurance + 3.6 billing remain.
  - Composio Vercel env now holds: REVIEW_TOKEN_SECRET, ATOSHIP_API_KEY, EMBEDDINGS_API_KEY/BASE_URL/MODEL.
- **2026-07-03 (cont.)** — Judah: use **Hyperbrowser** (Composio) for browser tasks instead of asking / chrome-claude; full permission to finish the project. Ran the autonomous Privy signup test via Hyperbrowser: agent drove visby.me/login, entered a Gmail +alias (fresh account), Privy sent the OTP — all working. BLOCKED at reading the OTP: the connected Gmail lacks read scope (403). Initiated a Gmail read-scope re-auth (Composio one-click link) — once active I complete fresh-signup → confirm Solana wallet, fully autonomous. See [[composio-tool-router]]. Prior localhost browser check already confirmed /login + Privy modal work post-fix.
- **2026-07-03 (cont.)** — Judah confirmed the Solana wallet works (fix verified) + requested **account suspend + ban**. BUILT (migration via Composio + 2 Sonnet subagents + my auth-critical edits): profiles.account_status ('active'|'suspended'|'banned', is_flagged backfilled→suspended) + `src/lib/account-status.ts` (isBanned/isRestricted, fail-open). Enforcement: tRPC protectedProcedure rejects banned; transfer/prepare + onramp charge-saved/fulfill reject banned (only ban freezes own funds); mint + /api/listing + listings.listForSale reject suspended-OR-banned. Moderation route: suspend_user/ban_user/reinstate_user (+ flag_user alias) → sets account_status + moderation_reason/at/by + delists their listings + audit events; report_id now optional for user-level actions. New /api/account/status. Admin Users page: status badges + Suspend/Ban/Reinstate buttons. New client AccountGate (providers: PasswordGate→AppLock→AccountGate→children): banned=full-screen block + sign-out, suspended=dismissible banner, fails open. Verified tsc clean, clean hydration (no repeat of the password-gate crash — AccountGate imports are client-safe), routes reject unauth 401/403. Blueprint 6.8 done.
- **2026-07-03 (cont.)** — Verified suspend/ban OPERATIONAL (13/13 live-DB checks: banned blocks all incl money, suspended blocks selling only, legacy is_flagged restricts, fail-open, ban_user delists + reinstate reverses). Then "keep going" → Phase 4 via an ultracode Workflow (recon fan-out → build → adversarial verify):
  - **4.7 order state machine DONE**: src/lib/order-state-machine.ts (OrderStatus 'paid'|'shipped'|'delivered'|'cancelled'|'refunded' + LEGAL_TRANSITIONS + assertTransition) + scripts/test-order-state-machine.mjs (31/31 pass) + TODO markers at write sites. Verify agent confirmed the table matches EVERY real orders.status write site — no missing/wrong edges. Additive/non-breaking; CAS still the runtime enforcer. Deployed.
  - **Phase 4 recon (for next)**: (4.2) Plaid = DEAD (gated behind unset NEXT_PUBLIC_BANK_LINKING) → safely removable; **SnapTrade = LIVE** (always renders on /wallet, fires /api/snaptrade/accounts every load) → removing it needs the UI (payment-methods-manager.tsx) gutted too or users hit errors. Tables plaid_items/snaptrade_users need drop-migrations; deps plaid/react-plaid-link/snaptrade-typescript-sdk; keep secret-crypto.ts + SECRET_ENCRYPTION_KEY. (4.8) reconciliation inputs mapped: orders.pay_method/payout_method/stripe_payment_intent/received_lamports/sale_channel, fees.ts (FEE_BPS visby 900/partner 350, floor 50c), payout_released/payout_tx, cron pattern (CRON_SECRET timing-safe) — existing /api/cron/reconcile-settlements does detect-and-alert. NOTE: **two order state machines** — `orders` (built) + `sdk_orders` ('pending'|'paid'|'minted'|'failed'|'cancelled', separate writer sdk-settle.ts).
- **2026-07-03 (cont.)** — Judah connected Stripe on Composio ("you can toggle it yourself"). Stripe acct acct_1TbW75F8Q0vIw2ei (Visby Inc) is fully OPERATIONAL: charges/payouts/transfers/us_bank_account_ach all ACTIVE → unblocks 4.1/4.3/4.4 (see [[launch-integrations-status]]; app still on TEST key though). Built 2 Phase-4 items via ultracode workflow (build×2 → adversarial verify, both GO):
  - **4.8 reconciliation DONE**: /api/cron/reconcile-fees (daily 08:30, CRON_SECRET, READ-ONLY, grep-verified no writes) re-derives fees via the REAL feeBreakdown + payout-consistency checks, alerts >1¢ drift. src/lib/reconcile.ts (pure reconcileOrder) + scripts/test-reconcile-fees.mjs (13/13). vercel.json cron added.
  - **4.1 Financial Connections FOUNDATION** (server only, no UI yet): migration_linked_bank_accounts (applied live) + /api/bank/{create-session,complete,list,disconnect} (authed+wallet-owned; complete verifies FC-session.account_holder.customer==caller's stripe_customer; SDK v16.12 native FC types). REMAINING for 4.1: wallet UI (Stripe.js collectFinancialConnectionsAccounts) replacing the dead Plaid tile + live bank-link test → then 4.2 (remove Plaid[dead]/SnapTrade[live on /wallet]). Deployed.
- **2026-07-03 (cont.)** — **4.1 + 4.2 DONE** (workflow: build UI + remove server, adversarial verify GO). 4.1: wallet payment-methods UI (payment-methods-manager.tsx) now does the Stripe FC bank-link (create-session → Stripe.js collectFinancialConnectionsAccounts → complete), Plaid/SnapTrade UI gone. 4.2: deleted all plaid/snaptrade routes+libs, dropped both tables (live), removed 'plaid_items' from RLS arrays, npm-uninstalled plaid/react-plaid-link/snaptrade-typescript-sdk, stripped PLAID_*/SNAPTRADE_* from .env.local, removed stale create-migrations; kept secret-crypto.ts. tsc clean after all removal. Deployed. Phase 4 remaining: 4.3 Connect payouts, 4.4 ACH (both unblocked by live Stripe acct), 4.5 multi-currency, 4.6 Moov checkout, 4.9 Stripe Tax, 4.10 1099-K (4.9/4.10 flag-gated, need Judah nexus/entity confirm).
---

## Appendix — original build map (verbatim, archived reference)
> Extracted word-for-word from `visby-master-launch-plan` companion doc **visby-build-map.pdf** (2026-07-02). Kept for fidelity; **blueprint.md supersedes it as the working checklist.**

```
Visby — Build Guide Map (for Claude Code)
Provenance marketplace for physical goods on Solana. Non-technical founder + Claude
Code build. This is the single source of truth for what’s left to build, in the order to build it.
How to use this in Claude Code: paste the Resume Block first, let it report
phase/step/last files/next step. Work top-to-bottom within the current phase. Run a
preview check after every step — Claude describes what you should see in the browser
before moving on. Don’t advance a phase until its gate clears.
Current status (already done — do not rebuild)
Concept + full blueprint locked; stack chosen.
GitHub (private repo, day 1), VS Code, Vercel path.
Visby CLAUDE.md (AIS-OS-based) + optifine / visby-coding skills (resume-block +
preview-check pattern).
Sentry configured on visby-web (Next.js project).
Payment processor decisions made (see Locked Decisions below).
You are at the START of Phase 1 feature-building. No Phase 1 features confirmed
complete yet.
Locked decisions (don’t re-litigate — build to these)
Stack: Next.js 14 · Supabase (Postgres + Auth) · Privy (auth/wallets/signing) · Metaplex
Core (NFTs) · Solana/PoH · Arweave via NFT.Storage · tRPC · Helius (RPC) · Vercel.
Money movement:
Stripe = primary processor — online cards, ACH, payouts, and Stripe Financial
Connections for bank-account linking/verification (this replaced Plaid — same job,
already in stack, no separate vendor).
Moov = card reader only (in-person / card-present).
Coinbase Commerce = crypto payments.
Li.Fi = cross-chain swaps.
Fraud/identity: Civic (KYC) · Chainalysis (wallet screening) · Stripe Radar · Privy MFA.
Shipping: EasyPost (multi-carrier aggregator) — replaces the old FedEx line.
Provenance NFT: referred to as the Tally NFT throughout.
 Architecture directive — NON-CUSTODIAL: Design all money flows so Visby never
holds funds (processors act as merchant-of-record; escrow releases are processor-
mediated, not Visby-held). The moment Visby custodies money, it becomes a money
transmitter → six-figure, multi-state licensing. This directive shapes every payment task
below. Escrow, Novo holdings, and card-reader funds are the danger zones — flag each for
a non-custodial pattern.
Phase 1 — Foundation
Original-plan items + the auth/listing features you added.
Next.js + Supabase + Privy wiring; Supabase schema; tRPC API layer (enable Supabase
RLS on every table).
Solana wallet connect (via Privy).
Basic Tally NFT mint (Metaplex Core) → metadata/media pinned to Arweave → Helius
read-back.
Product listing + serial number binding.
Simple USDC buy/sell.
Username / account security system — stated mandate: the most robust financial-
grade security on the market; a leak here exposes everything. Build: username,
password, email, 2FA, account recovery (recovery phrase). Note: Privy already provides
email/social login, MFA, and wallet recovery — layer on top of Privy, don’t rebuild what it
gives. Fill the gaps (recovery phrase UX, password layer if wanted) rather than
duplicating.
Transparency cutout on photo upload — auto background-removal so the item is
isolated on transparent; allow/enforce transparent PNG uploads.
Known bug to fix: the current thumbnail comes out with a black background —
transparency is being flattened. Almost always the thumbnail is saved as JPEG (no
alpha) or Sharp is calling .flatten() / outputting .jpeg(). Fix: output thumbnails
as PNG or WebP, remove any .flatten(), and if the cutout runs on a canvas
export with toBlob(cb, 'image/png') — never 'image/jpeg'. Verify the stored file
itself has a real alpha channel before assuming it’s a CSS issue.
Profile scaffolding: business vs. personal — two profile types in the schema now (full
ID-verification gate lands in Phase 5 with Civic). Build the distinction early so later
phases hang off it.
Gate: a user can sign up, get a Privy wallet, list an item with a transparent-background
photo, and a Tally NFT mints and reads back.
Phase 2 — Marketplace
Browse / search / filter UI.
Ownership-history display (public provenance trail).
Public profile pages (respecting business vs. personal type).
Seller dashboard.
QR / NFC serial linking.
Business bulk serial logging + mint-on-sale (business accounts only) — let a business
bulk-upload/register serial numbers for a whole batch of inventory at once (e.g. CSV
import), storing them as pending, unminted records tied to the business profile. The
Tally NFT mints only at point of sale — not on upload — so businesses aren’t paying to
mint unsold inventory and provenance starts at the real first sale. On a sale, the order
flow pulls the matching pending serial, mints its Tally NFT, and marks it live. Depends on
the business-profile scaffolding (Phase 1); the mint-on-sale trigger is the same pattern
as the SDK’s auto-mint-on-purchase (Phase 4) and must run through the shared order
state machine.
EasyPost shipping integration — label creation, tracking synced to order, delivery
webhook (this fires the rating email below and, later, escrow release). Add shipping
insurance at label creation for high-value items.
Rating/review system — on delivery-confirmed (EasyPost webhook), send a
confirmation email with a review link tied to that order + item.
Flag system — flag a product or person for counterfeiting, illegal, or inappropriate
content. Wire into the admin flagging backend (below). Matures in Phase 5 with the
takedown flow.
Admin page refresh + dashboard overhaul — match the site’s white + shadows look,
and make it functional: admin accounts with passwords, admin-status granting, tiered
admin access levels, a flagging backend (queue of flagged items/users), and
company email generation.
Gate: a test buyer can browse, buy from a test seller, the item ships via EasyPost, delivery
triggers a review email, an admin can see/flag activity, and a business account can bulk-log
a batch of serials that stay unminted until each one sells.
Phase 3 — Payments
Everything money-movement. Every task here inherits the non-custodial directive.
Stripe fiat integration (online cards, ACH, payouts).
Stripe Financial Connections — bank-account linking/verification; powers the wallet-
page bank preview.
Bank-account preview on wallet page.
Moov card reader — in-person/card-present acceptance. Reconcile card-reader sales
back into the same order state machine (a reader sale must still trigger Tally mint +
payout logic).
Novo — business bank management for fund holdings. Flag against custody directive —
structure so held funds don’t make Visby a transmitter.
Li.Fi cross-chain bridge — multi-crypto support (target: as many as possible, ~100).
Add a price-view toggle so prices can display in crypto, not just fiat. For multi-currency
wallets, default to the viewing currency first.
Multi-currency checkout with auto-conversion to the recipient’s preferred currency.
Payout system (fiat + crypto).
Stripe Tax — marketplace-facilitator sales-tax collection & remittance (you likely must
collect on sellers’ behalf).
1099-K / seller tax reporting — via Stripe Connect (issue forms once sellers cross
thresholds).
Reconciliation jobs — Stripe + Coinbase + Moov + on-chain must reconcile against
each other and against the 2.5% fee. Build this early, not retrofitted.
Gate: money moves and settles across all rails without Visby taking custody, tax is
calculated, and every rail reconciles.
Phase 4 — Pay with Visby SDK
Core pillar — never cut. Embeddable checkout for third-party merchants.
Embeddable button / widget.
Hosted checkout modal.
Merchant API + webhooks.
Auto-mint Tally NFT on third-party purchase.
Merchant dashboard.
Gate: a third-party merchant drops in the button and a purchase on their site mints a Visby
Tally NFT. Compliance note: being a checkout intermediary widens regulatory surface —
keep non-custodial, ship after the marketplace has proven out.
Phase 5 — Fraud & Trust + Mainnet Launch
Civic identity verification (KYC).
Verification-ID gate — redirect to license/ID verification required to list or resell. Buy
unverified, but cannot sell unverified. Applies to both business and personal profiles.
Brand serial-number registry.
Chainalysis wallet screening (must pass before mint/sale).
NFC chip workflow.
Escrow / dispute system — non-custodial pattern. Ideally escrow releases to seller only
on confirmed delivery (EasyPost webhook).
Chargeback & dispute handling — evidence capture (proof of delivery + provenance
trail), and a rule for exactly when a seller gets paid. High-value goods = high chargeback
exposure.
Counterfeit takedown flow — built on the flag system: removal process + policy for
“NFT says real but item isn’t.” You’re selling authenticity itself, so this is existential.
Devnet → mainnet cutover (Helius/Metaplex); fund a small, monitored mint wallet; pre-
fund Arweave so mints don’t fail mid-upload.
Gate: identity + fraud stack live, disputes handled safely, and cutover to mainnet.
Cross-cutting — always-on (build alongside every phase)
Order state machine that fails safely — a failed payment must never leave an order
stuck “paid but unshipped.” Every rail (Stripe, Moov, Coinbase, SDK) feeds the same
state machine.
Security hardening — secrets management (no keys in code — placeholders like
YOUR_HELIUS_API_KEY), rate limiting on mint + checkout endpoints, backups + disaster
recovery, and a wallet-recovery policy (what happens when a user loses access to a
Privy-managed wallet).
Legal pages built into the app — Terms of Service, Privacy Policy, Seller/Marketplace
Agreement, Acceptable Use / Prohibited Items. (Content from counsel; you build the
routes/pages.)
Data-privacy compliance — CCPA/GDPR: data-export and deletion endpoints, since
you hold identity + financial data.
Customer support + refund/return mechanics — wired back into the order state
machine and the mint/payout logic (a refund may need to reflect on the Tally NFT
provenance).
Testing ladder — local + devnet → staging (devnet + Stripe/Coinbase test mode) →
mainnet closed beta (allowlisted, tiny real value) → production. A build only moves up
when it clears that stage. Test unhappy paths.
Parked / later (do NOT build now)
Burner card (extension middleman) — extension pays on non-compatible sites by
creating a one-time burner card, funding it with the exact amount from the primary
method, and paying with it. Pop-up must warn no Tally NFT is included on these
purchases. Explicitly low priority — after core platform.
Non-code blockers (not for Claude Code, but they gate the
code)
These aren’t build tasks, but they decide how the code above gets written — resolve early:
1. Custody vs. non-custodial — the single decision behind escrow, Novo, payouts, and
the card reader. Get a fintech/marketplace attorney to confirm the non-custodial
structure before Phase 3.
2. Sales-tax nexus — confirm where you must collect before switching on Stripe Tax.
3. Written AML/KYC program — regulators expect a documented program behind the
Civic + Chainalysis tooling.
4. Pre-launch security audit / pentest — before mainnet, given the PII + wallet + payment
access you centralize.
5. Business insurance — general liability + cyber insurance.
```
