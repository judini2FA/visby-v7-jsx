# Visby — Launch Threat Model & Security Deliverables

> Blueprint item **11.6** (Phase 11 — Test Everything). This document is the pre-launch security
> deliverable: (1) a dependency-audit summary, (2) a real threat model of the money paths and trust
> boundaries, and (3) external-pentest / bug-bounty scoping.
>
> Status: **pre-mainnet.** The app runs on TEST/SANDBOX keys and Solana **devnet**. Several money-path
> dark flags are still off (`STEP_UP_ENFORCED`, `ACH_ENABLED`, `MOOV_ENABLED`, `KYC_REQUIRED`,
> `STRIPE_TAX_ENABLED`, `MULTICRYPTO_ENABLED`); `OFAC_SCREENING_ENABLED` is **on**. Anything gated by a
> dark flag must get its own live test before the flag flips (blueprint 13.3).
>
> Non-custodial posture is the load-bearing security property: **Visby never holds a user's private
> keys.** Wallets are Privy embedded MPC wallets; the mint authority and treasury keys are Visby's own
> operational keys, not user keys.

---

## 1. Dependency audit (`npm audit`)

Run: `npm audit` / `npm audit --json`. Snapshot:

```
62 vulnerabilities (12 low, 34 moderate, 15 high, 1 critical)
prod deps: 902 · dev deps: 364 · optional: 268
```

**The headline count is misleading.** Every finding is transitive to a small number of large SDKs, and
**none is a fresh, independently-fixable app dependency** — they all resolve only via a
`npm audit fix --force` SemVer-major bump of a top-level SDK (`@privy-io/react-auth`, `@solana/spl-token`,
`next`, `vitest`, `eslint-config-next`), which is a compatibility decision, not a one-line patch. The two
findings that DO have a clean non-breaking fix (`ws`, `minimatch`) are worth doing now.

### 1a. Real, actionable now (clean fix, no breaking change)

| Finding | Severity | Package (root) | Prod/Dev | Why it matters here / action |
|---|---|---|---|---|
| `ws` uninitialized-memory disclosure + DoS (GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p) | high | `ws` via `viem` / `@ethersproject/providers` | prod (transitive) | Only reachable if we open a WS connection through viem/ethers. We use viem/ethers only for **watch-only ETH** reads, not a server WS listener — low real exposure. Still: `npm audit fix` resolves it with **no** breaking change. Do it. |
| `minimatch` ReDoS (GHSA-3ppc-4f35-3m26 + 2 more) | high | `minimatch` via `@typescript-eslint/*` | **dev-only** (lint toolchain) | Never runs in prod; only bites a dev running eslint on hostile glob patterns. `npm audit fix` clears it. Low urgency, but free. |

**Action:** run `npm audit fix` (non-`--force`). It resolves `ws` and `minimatch` without a major bump.
Re-run `npm audit` after and re-snapshot this table.

### 1b. Real but not cleanly fixable now (transitive to a pinned SDK; needs a vetted major bump)

| Finding | Severity | Package (root) | Prod/Dev | Assessment |
|---|---|---|---|---|
| Coinbase Wallet SDK unknown vuln (GHSA-8rgj-285w-qcq4) | high | `@coinbase/wallet-sdk` via `@privy-io/react-auth` | prod (transitive) | We do **not** use Coinbase Wallet as a connector; it ships inside Privy's wallet-adapter bundle. Fix = `@privy-io/react-auth@3.x` (we're on `^1.80`) — a **major** upgrade of our auth SDK. Track as a deliberate Privy-upgrade task, test-gated; don't `--force`. |
| `bigint-buffer` buffer overflow via `toBigIntLE()` (GHSA-3gc7-fjrx-p6mg) | high | `bigint-buffer` via `@solana/spl-token` / web3.js | prod (transitive) | Reached during SPL-token math on the mint/payout path. Overflow requires an attacker-controlled oversized buffer into `toBigIntLE`; our inputs are our own amounts, not attacker bytes — low real exposure. Fix downgrades `@solana/spl-token` (major); revisit with the Solana SDK upgrade. |
| `@solana/web3.js` ≤1.98.4 (pulls vulnerable `jayson`→`uuid`) | moderate | `@solana/web3.js` (direct) | prod | The core Solana client; the `uuid` bounds-check issue is not on a path we hit with attacker input. Bump alongside the Metaplex/Privy Solana upgrade wave. |
| ethers v5 / `elliptic` / `bn.js` / `web3-*` cluster (GHSA-848j-6mx2-7j84 risky-primitive, GHSA-378v infinite-loop) | moderate/low | `ethers@5`, `elliptic`, `web3-*` via `@privy-io/react-auth` | prod (transitive) | The legacy ethers-v5 / web3.js graph inside Privy. We do not sign ETH transactions (ETH is watch-only) so the `elliptic`/`bn.js` risky-signing paths aren't exercised with our secrets. Cleared only by the Privy 3.x upgrade. |
| `next` 14.2.35 — DoS/SSRF/cache-poison/XSS advisory cluster | high | `next` (direct) | prod | Real and prod-facing. Most are self-hosted-image-optimizer / RSC / middleware-i18n DoS + a CSP-nonce XSS. We deploy on **Vercel** (managed image optimizer, no custom middleware i18n), which mutes several. **Recommended:** upgrade to the latest patched **Next 14.x** line before mainnet rather than jumping to 16 — pull the security fixes without an App-Router major migration. This is the single most launch-relevant audit item. |
| `postcss` <8.5.10 XSS-in-stringify (GHSA-qx2v-qp2m-jg93) | moderate | `postcss` via `next` | prod (build-time) | Build-time CSS tooling, not a runtime request surface. Rides along with the Next upgrade. |

### 1c. Dev-only / noise (not a production attack surface)

| Finding | Severity | Package | Note |
|---|---|---|---|
| `vitest` / `vite` / `esbuild` dev-server request leak (GHSA-67mh-4wv8-2f99) | **critical** (nominal) / moderate | `vitest`, `vite`, `esbuild`, `@vitest/mocker`, `vite-node` | The lone "critical" in the count. It is the **esbuild dev-server** advisory — a website can read the local dev server's responses. It affects ONLY a developer running `vitest`/`vite dev` locally; **it never ships to production**. Not a launch blocker. Optional: bump `vitest` to 4.x (major) at leisure. |
| `glob` CLI command-injection (GHSA-5j98-mcp5-4vw2) | high | `glob` via `@next/eslint-plugin-next` → `eslint-config-next` | Only the `glob` **CLI** `-c/--cmd` is vulnerable; we never invoke it. Dev/lint toolchain. Clears with an `eslint-config-next` major bump. Noise. |
| `@typescript-eslint/*` (via minimatch, see 1a) | high | dev lint | Dev-only, cleared by `npm audit fix`. |

### Audit bottom line
- **Do now:** `npm audit fix` (clears `ws` + `minimatch`, no breaking change).
- **Do before mainnet:** upgrade `next` to the latest patched **14.x** (prod-facing DoS/XSS cluster).
- **Track as vetted major upgrades (not `--force`):** `@privy-io/react-auth` 3.x and the
  `@solana/spl-token` / `@solana/web3.js` / Metaplex wave — these collapse the bulk of the count.
- **Ignore for launch:** the `vitest`/`esbuild` "critical" and the `glob`/eslint findings — dev-only,
  never in the production bundle.
- **Do NOT run `npm audit fix --force` blindly** — it would major-bump Privy, Next, spl-token, and
  vitest at once and break the build. Each is a reviewed, test-gated upgrade.

---

## 2. Threat model

### 2.0 Assets & core invariants
- **User private keys** — never held by Visby (Privy MPC). Compromise class we design AGAINST at all times.
- **Mint-authority key & treasury (SOL/USDC float)** — Visby operational secrets. Their compromise is the
  worst case; kept server-only, never client-exposed, mainnet custody moves to KMS (blueprint 13.2).
- **Money-movement correctness** — every payout/settlement must be **exactly-once** and for the
  **server-computed** amount. Double-pay and price-tampering are the two highest-value attacks.
- **Service-role DB key** (`SUPABASE_SERVICE_ROLE_KEY`) — bypasses RLS. Server-only; never in a client
  bundle or a log. Its leak = full DB read/write.

### 2.1 Money paths

Every rail settles through **one** shared, server-priced fulfillment path and **one** payout function
(`releasePayout`). Buyer-facing prices are never trusted; the server re-reads `item.price_usdc` from the
DB and computes the charge (`src/app/api/stripe/payment-intent/route.ts` — `priceCents = item.price_usdc
* 100`; client-supplied amounts are ignored). This is the single most important control against
price-tampering.

| Path | How it moves | Custody | Key controls | Residual / notes |
|---|---|---|---|---|
| **Seller payout (crypto default)** | Treasury sends SOL (or USDC if seller opted in) from the authority wallet to the seller wallet on delivery-confirm. | Non-custodial: treasury is Visby's own float, seller's wallet is theirs. | OFAC screen **at the top of `releasePayout`, fail-closed** (§2.3); FX cap so the treasury never disburses more SOL than it received for a crypto order; `net<=0` short-circuits; idempotency is the caller's job (release only when `payout_released` is unset). | **RESIDUAL R1 (crypto double-pay-on-retry):** if the on-chain send succeeds but the DB write of `payout_tx` fails, a later retry can re-send. Affects SOL, USDC, and SDK-merchant payout. Mitigation candidate: optimistic `payout_tx` write / on-chain ledger dedupe before send. Tracked in blueprint 4.5 "Standing". |
| **Seller payout (fiat / Stripe Connect)** | `payoutToConnect` transfers USD to the seller's Connect account when they chose bank AND onboarding is complete. | Non-custodial: Stripe holds/settles; Visby never touches the bank rail directly. | Additive gate — fires ONLY on `payout_type==='bank'` + `payouts_enabled`; any DB miss/error/throw falls through to crypto; **a fiat failure is returned as-is (retryable), never downgraded to crypto** (double-pay guard); idempotency key `connect-payout:<order.id>` within Stripe's window. | Server resolves the Connect account id (seller never pastes `acct_`). Bank step-up binds the constant `'connect'` on both sides. |
| **ACH pay-in (buyer bank debit)** | Buyer debits a Financial-Connections-linked account; **nothing mints until funds clear** (`payment_intent.succeeded`, days later). | Non-custodial. | Durable single-flight `ach_payins` (partial-unique on `(item,buyer) where processing`) blocks a 2nd debit across the multi-day settle window (Stripe's 24h idempotency key alone was insufficient); sold-away refund fires only if the item transferred to a **third party**; redundant-debit guard distinguishes webhook redelivery from a genuine duplicate and never refunds when no order exists. | Dark (`NEXT_PUBLIC_ACH_ENABLED`). Before enabling: subscribe the Stripe endpoint to `payment_intent.payment_failed` + `.canceled`, not just `.succeeded`. |
| **Card (Stripe / Moov)** | Server-priced PaymentIntent (Stripe) or Moov card token → `createMoovTransfer`. Fulfills **only** on `completed`/`succeeded` via the shared `fulfillPurchase`. | Non-custodial: PSP holds funds; seller paid by payout-on-delivery. | Server-priced; authed + wallet-owned + rate-limited; `waitForRailResponse`; identical order/mint/payout path as every other rail. | Moov is dark (`NEXT_PUBLIC_MOOV_ENABLED`) + sandbox keys. Card-present/tap-to-pay deferred to Phase 9. |
| **P2P crypto transfer / send-money** | Direct wallet→wallet SOL/USDC signed by the sender's Privy wallet. | Fully non-custodial (Visby never co-signs user transfers). | Daily-cap enforced by an **atomic DB RPC** (`prepare_transfer_atomic`) closing the original TOCTOU race; `confirmTransfer` re-verifies amount + direction **on-chain**; step-up binds the recipient + token + amount so a stolen proof can't be replayed to a different target. | OFAC screening is **not yet** applied to p2p recipients / buyer crypto pay-in (only payouts) — see §2.4 gaps. |
| **SDK merchant settle** | On a partner sale the buyer's NFT mints, then a **decoupled cron sweep** pays the merchant their `merchant_net_usd` in USDC (`attemptMerchantPayout`), keeping the checkout hot path free of fire-and-forget risk. | Non-custodial. | CAS claim `pending|failed→processing` **before** the on-chain send (exactly-once); guards on minted-only + `net>0` + wallet present; cron `CRON_SECRET`-gated, timing-safe, fails closed; the settle hot path is byte-unchanged. | Same **R1** confirm-timeout-then-retry double-pay class as §money R1. A stuck `processing` row is intentionally NOT auto-reclaimed (no double-pay) but has **no alert yet**. |

### 2.2 Non-custodial posture (Visby never holds user keys)
- Wallets are **Privy embedded MPC** wallets — no seed phrase is ever surfaced; "Export" is a muted
  advanced self-custody option. External wallets are **address-only / watch-only**. Checkout advertises
  "No seed phrases."
- The only keys Visby holds are **operational**: the Solana mint authority and the treasury float. These
  are server-only env secrets, never shipped to the browser. Mainnet moves the mint authority to **KMS
  custody** (blueprint 13.2, currently parked).
- Consequence: a full front-end / session compromise cannot drain a user's wallet without the user
  **also** approving a wallet signature (and, for sensitive actions, a step-up signature — §2.3).

### 2.3 Auth & trust boundaries
- **Privy token verification (server-side).** `getAuthedContext` (`src/lib/auth.ts`) verifies the Privy
  JWT with `PrivyClient.verifyAuthToken`, resolves the user's linked wallets, and returns
  `{wallets,userId,sessionId}`. Missing/invalid token or unconfigured server auth → `null` → **fail
  closed**. `callerOwnsWallet` gates every wallet-scoped write (mint, listing, transfers, payout config,
  bank, disputes) so a user can only act on wallets they actually control (closes the mint / DM-read /
  upsertProfile IDOR class).
- **Session revocation.** `isSessionRevoked(sessionId)` denies a "logged-out-other-devices" session even
  though Privy's token is still cryptographically valid. It **fails open** (a DB hiccup can't lock
  everyone out) — an accepted availability-over-strictness tradeoff for revocation specifically.
- **Ban / suspend / deleted gate.** `account-status.ts` reads the **worst** status across a user's linked
  wallets. `banned` (and a CCPA/GDPR-`deleted` account, enforced as banned) → fully locked out incl. all
  money routes; `suspended` (or legacy `is_flagged`) → can't sell/mint/list but keeps access to own
  funds. **Fail-open** on DB error (durable status re-bites next request). Enforced in tRPC
  `protectedProcedure` + every money route.
- **Step-up action-signing (sensitive actions).** For payouts, tally transfers, send-money, and
  off-session saved-card charges, the user signs a human-readable challenge whose **action string binds
  the destination** (recipient wallet / payout type / amount / asset), so a proof authorizes the exact
  target the user reviewed — not just the action class. **H1 fix (`step-up-shared.ts`):** each variable
  field is `encodeURIComponent`-encoded before the `:`-join, so a value containing `:` can't shift a
  field boundary (`payout('a:b','c')` vs `payout('a','b:c')` no longer collide). 5-minute freshness
  window. MFA enrollment is read authoritatively server-side (`getUserMfaMethods`) and treated as
  fail-closed. Enforced live only once `NEXT_PUBLIC_STEP_UP_ENFORCED=1`.
- **Service-role DB access.** Server routes use `createServiceClient()` (service-role key, RLS-bypassing)
  ONLY behind an auth check. RLS posture is mixed and being tightened; new tables must `ENABLE RLS` and
  default to service-role-only. The service-role key must never reach a client bundle or a log — its leak
  is a full-DB-compromise event.

### 2.4 Input trust (webhooks & server-priced everything)
- **Webhooks fail closed.**
  - *Stripe* (`/api/stripe/webhook`): rejects a missing `stripe-signature` (400) and verifies via
    `stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET` — an invalid signature is a 400
    before any fulfillment. Fulfillment reads `item_id`/`buyer_wallet` from **verified** event metadata,
    not the request body.
  - *Shipping / AtoShip* (`/api/shipping/webhook`): HMAC-SHA256(raw body) **or** a shared-secret
    (`Authorization: Bearer` / `?secret=`), timing-safe compared. If `SHIPPING_WEBHOOK_SECRET` is unset
    it **fails closed (401 on everything)** — "no secret configured" never means "trust anything", and
    this endpoint releases money. (Confirm AtoShip's real signature scheme before go-live.)
  - *Moov / KYC (Stripe Identity)*: signed + fail-closed; KYC status is **re-fetched from Stripe** before
    approving (never trust the webhook body's status field).
  - *Cron endpoints* (`reconcile-fees`, `refresh-ofac`, `pay-merchants`, `redeliver-webhooks`):
    `CRON_SECRET`-gated, timing-safe, fail closed.
- **Server-priced checkout.** Buyer never sets the price. Charge = `item.price_usdc` (+ server-computed
  tax when enabled) re-read from the DB at PI creation. Fee math is server-side (`feeBreakdown`, 9% /
  $0.50 floor) and cross-checked daily by the read-only `reconcile-fees` cron (alerts on >1¢ drift).
- **Injection-guarded human-read inputs.** Support / bug-intake forms `escapeHtml` all user fields before
  the notification email — content is inert **data** for a human agent, never interpreted. The
  auto-triage that would READ+ACT on inbound email is deliberately **out of scope** (prompt-injection
  sensitive; the plan is propose-PR-only, never auto-act on email text).

### 2.5 Known residual risks (carry into launch)

| ID | Risk | Where | Status / mitigation |
|---|---|---|---|
| **R1** | **Crypto-payout double-pay on retry** — on-chain send succeeds but the `payout_tx` DB write fails; a later retry re-sends. | `payout.ts` (SOL + USDC), `sdk-merchant-payout.ts` | Known & tracked (blueprint 4.5 "Standing", 5.6 backlog). Real money risk on mainnet. **Recommended hardening before mainnet:** write an optimistic `payout_tx`/ledger claim before the send, or dedupe on an on-chain reference. |
| **R2** | **Dispute evidence goes to a PUBLIC bucket** — `dispute-evidence` bucket is created `public: true`; object URLs are unguessable but not access-controlled. Sensitive buyer/seller docs (IDs, receipts) are world-readable if the URL leaks. | `src/app/api/disputes/evidence/route.ts` | Known (blueprint 6.5 follow-up). **Recommended:** move to a private bucket + short-lived signed URLs before real disputes carry PII. Same public-bucket pattern as `item-images` (acceptable there, not for evidence). |
| **R3** | **OFAC screen covers payouts only** — not yet applied to p2p transfer recipients or buyer crypto pay-in. | `ofac.ts` wired only into `releasePayout` | Known (blueprint 6.4 follow-up). Extend `screenAddress` to the transfer recipient + crypto pay-in paths. |
| **R4** | **Session-revocation & account-status fail OPEN** — a DB outage lets a revoked session / a just-banned account through until the DB recovers. | `auth.ts` `isSessionRevoked`, `account-status.ts` | Deliberate availability tradeoff. Acceptable because status is durable (re-bites next request) — but note it: a ban is not instantaneous under a DB outage. |
| **R5** | **Mint authority + treasury are hot keys** — server-held operational secrets; on devnet today, KMS custody parked. | mint / `solana-fund` | Highest-blast-radius asset. **Blueprint 13.2 gate:** move to KMS + fund a monitored wallet before mainnet. |
| **R6** | **No alert on a stuck `processing` merchant payout** — a row stuck mid-payout is safe (not auto-reclaimed → no double-pay) but silently stalls. | `sdk-merchant-payout.ts` | Add a stuck-row alert. Non-blocking. |
| **R7** | **Prod dependency advisories** — `next` 14.2.35 DoS/XSS cluster; transitive `ws`/`bigint-buffer`. | §1 | `npm audit fix` + a patched Next 14.x before mainnet. |
| **R8** | **Test/sandbox keys + dark flags** — the app is on TEST Stripe / SANDBOX Moov / devnet; several money flags are off. | env / blueprint 13.1–13.3 | Each flag gets its own live test before flip; keys rotate to live at cutover. A test-vs-live-mode mismatch is itself a money-safety risk (reconcile per blueprint 13.1). |

---

## 3. External pentest + bug-bounty scoping

### 3.1 What to test (highest-risk surfaces — point testers here first)
1. **Price / amount tampering across every rail.** Try to pay less than `item.price_usdc`, mutate
   client-sent amounts, or replay a checkout for a re-priced item. All charges must be server-priced.
2. **Payout / settlement exactly-once.** Force retries, double webhook deliveries, and confirm-timeout
   scenarios on `releasePayout`, ACH `payment_intent.succeeded`, and the SDK merchant sweep — hunting for
   the **R1** double-pay. This is the single highest-value target.
3. **Step-up action-signing.** Attempt to replay a step-up proof for one destination/amount against a
   different one (transfer, payout, send-money, off-session charge); probe the H1 delimiter fix with
   `:`-containing inputs and freshness-window edges.
4. **Webhook forgery / replay.** Unsigned or wrong-signature Stripe/Moov/KYC/shipping webhooks; a
   shipping webhook with no `SHIPPING_WEBHOOK_SECRET` set (must 401); KYC approval by forging a
   `verified` body (must be defeated by the server re-fetch).
5. **AuthZ / IDOR.** Act on wallets you don't own; read another user's DMs, disputes, orders, bank/Connect
   config, or merchant orders; confirm `callerOwnsWallet` + the buyer/seller/admin checks hold everywhere.
6. **Ban / suspend / deleted enforcement.** Confirm a banned account is locked out of ALL money routes
   and a suspended one can't sell but can still access own funds; probe the fail-open window.
7. **Cron auth.** Hit `reconcile-fees` / `refresh-ofac` / `pay-merchants` / `redeliver-webhooks` /
   `ach` cron routes without a valid `CRON_SECRET` (must fail closed, timing-safe).
8. **OFAC bypass.** Confirm a sanctioned payout wallet is HELD and an unhealthy/stale list fails **closed**
   (holds), not open.
9. **Standard web classes on the Next app:** XSS (incl. the CSP-nonce advisory), SSRF via image
   optimizer / URL fetches, cache poisoning, and open-redirect on the extension auth-relay
   (`/extension-auth`, origin-validated `externally_connectable`).

### 3.2 In scope
- The production web app (`visby.me` / `app.visby.me`) — all authed API routes, webhooks, cron endpoints.
- Auth & session handling (Privy token verification, session revocation, step-up, ban/suspend gate).
- The SDK/merchant checkout + settlement path and the browser extension auth relay.
- AuthZ / IDOR across all wallet-scoped resources.
- Server-priced checkout & fee math; payout / settlement idempotency.

### 3.3 Out of scope
- **Solana chain / consensus internals**, and third-party infra security (Privy, Stripe, Moov, Supabase,
  AtoShip, Vercel, Helius) — report their issues to them; we scope only **our misuse** of them (e.g. a
  webhook we verify wrong, a key we expose, an RLS gap we own).
- **Denial-of-service / volumetric / rate-limit stress** unless it demonstrates a logic bypass (e.g. a
  DoS that lets a double-pay through). We already know the transitive Next/ws DoS advisories (§1) — no
  need to re-report the CVE; a working exploit against our deployment is in scope.
- Findings that require a **compromised user device or leaked user private key** — outside the
  non-custodial threat model (we assume the user's own key can approve their own transfers).
- **Devnet/testnet-only** behavior and the dark-flagged features while their flags are off (they get
  dedicated live tests at cutover — blueprint 13.3).
- Social-engineering of Visby staff, physical attacks, and third-party SaaS account takeover.

### 3.4 Rules & the crown jewels to protect
- Test against a **staging** deployment on test keys where possible; never move real user money.
- **Do not** attempt to exfiltrate the `SUPABASE_SERVICE_ROLE_KEY`, `PRIVY_APP_SECRET`, the Solana
  mint-authority key, or the treasury keys — a *path* to any of these is the top-severity report class;
  stop at proof, don't weaponize.
- Report responsibly; a working **double-pay**, **price-tamper**, **auth bypass**, **webhook forgery**,
  or **service-role/secret exposure** is a top-tier bounty finding. Duplicate CVE re-reports of known
  transitive advisories (§1) are not.

---

## Appendix — key files referenced
- `src/lib/payout.ts` — `releasePayout`, OFAC gate, fiat/USDC/SOL rails, FX cap
- `src/lib/ofac.ts` — sanctions refresh + fail-closed `screenPayoutWallet`
- `src/lib/auth.ts` — Privy token verification, session revocation, `callerOwnsWallet`
- `src/lib/account-status.ts` — ban/suspend/deleted worst-status gate
- `src/lib/step-up-shared.ts` — destination-binding action strings + the H1 encode fix
- `src/app/api/stripe/webhook/route.ts`, `src/app/api/shipping/webhook/route.ts` — fail-closed webhooks
- `src/app/api/stripe/payment-intent/route.ts` — server-priced checkout
- `src/lib/sdk-merchant-payout.ts` — SDK merchant settle (CAS exactly-once)
- `blueprint.md` (§4.x, 6.x "Standing/RESIDUAL RISK"), `errors.md` (H1) — residual-risk sources
</content>
