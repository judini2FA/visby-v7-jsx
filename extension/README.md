# Visby Pay — Chrome Extension (MV3 scaffold)

A Manifest V3 Chrome extension that auto-detects checkout pages and offers a "Pay with Visby" affordance.

---

## What it does

1. Runs a content script on every page that scores the page for checkout signals.
2. When the score passes the threshold (see below), asks the background service worker whether the current domain is a registered Visby partner.
3. Injects a floating "Pay with Visby" pill (bottom-right, inside a Shadow DOM so host-page CSS cannot interfere).
4. Clicking the pill opens a glass panel that is **honest about NFT status and rail readiness**.

---

## Auto-detect heuristic

A score is computed from the page DOM. The pill is only shown when **score >= 3**:

| Signal | Points |
|---|---|
| `input[autocomplete~="cc-number"]` present | 2 |
| Stripe iframe (`src*="js.stripe.com"`) present | 2 |
| `#checkout` or `[data-shopify]` present | 2 |
| `input[name*="card"]` present | 1 |
| `input[name*="credit"]` present | 1 |
| `input[autocomplete*="cc"]` present | 1 |
| Button text matches `/pay now|place order|complete (purchase|order)|checkout/i` | 1 |
| Currency/price pattern found in body text | 1 |

A MutationObserver re-runs the check (debounced 800ms) after significant DOM changes, catching single-page-app route transitions and dynamically rendered checkout forms.

---

## Honesty design — partner vs. non-partner

**This is a legal and trust requirement, not optional UI polish.**

### Partner store (registered Visby SDK merchant)
The panel shows a green badge:
> "Includes Visby NFT provenance — ownership recorded on Solana."

A "Continue with Visby" button opens the Visby hosted checkout (`/sdk/checkout?origin=...`) in a new tab, which runs the real payment + mint flow.

### Non-partner store (everyone else)
The panel shows a red badge prominently:
> "Payment only — no provenance NFT (this is not a Visby partner store)."

Followed by:
> "Pay with Visby card payment is coming to this store. The card rail is not live yet — your Visby methods are shown read-only below."

**The "Continue" button is not shown on non-partner sites.** A sign-in link is offered instead so the user can view their saved methods in read-only mode. No fake purchase flow is initiated.

### Why this matters
- Using VisbyPay via the extension on a non-partner site does **not** mint an NFT.
- The card settlement rail (Rainforest) is **not yet live**. Showing a functional checkout button on non-partner sites would be fraudulent.
- The `partner-check` API (`/api/sdk/partner-check?domain=<host>`) is the source of truth for partner status.

---

## Rail limitation (non-partner pay not live yet)

Completing a purchase on a non-partner third-party checkout via Visby's card rail requires the Rainforest integration to be live. Until then, the extension is:
- **Detection + disclosure only** on non-partner sites.
- **Fully functional** on partner sites (opens the hosted checkout, which does mint).

---

## Load unpacked instructions

1. Open `chrome://extensions` in Chrome.
2. Enable "Developer mode" (top-right toggle).
3. Click "Load unpacked".
4. Select the `extension/` directory (this folder).
5. The "Visby Pay" extension will appear. Pin it to the toolbar.

If you see a warning about missing icon files, add `icon16.png`, `icon48.png`, and `icon128.png` to `extension/icons/` (see `icons/README.md`). The extension loads and functions without them.

---

## Privacy note — `<all_urls>` host permission

The manifest requests `host_permissions: ["<all_urls>"]`. This is required to:
- Run the content script on every page to detect checkout forms.
- Allow the background service worker to call `/api/sdk/partner-check` for any domain.

The extension does **not** exfiltrate page content. The content script only reads the DOM locally to compute a checkout score, then sends the current `location.hostname` to the background for a partner lookup. No full page HTML or form data is ever transmitted.

---

## Scaffolded vs TODO

### Done (this scaffold)
- MV3 manifest, service worker, content script, popup
- Score-based checkout auto-detection with MutationObserver for SPAs
- Shadow DOM isolation for injected UI
- Partner/non-partner honest UI with no-NFT disclaimer
- `GET /api/sdk/partner-check` with CORS, slug-based matching, env stopgap allowlist
- `VISBY_PARTNER_DOMAINS` env var for pre-DB partner overrides
- Auth message contract (`getAuth` / `setAuth`) in background
- Popup sign-in entry point + scaffolded payment-methods fetch

### TODO (future iterations)
- **Icon PNGs** — add `extension/icons/icon16.png`, `icon48.png`, `icon128.png`
- **Real Privy auth in popup** — full OAuth or wallet-connect flow so users can sign in from the popup and the `Authorization` token is passed to the payment-methods API
- **Merchants table `domain` column** — add a `domain text` column to `merchants` so partner matching is exact rather than slug-based heuristic (migration required)
- **Non-partner checkout completion** — wire up when Rainforest card rail goes live; the background `openCheckout` message contract is already in place
- **Popup methods display** — render real saved cards/wallets once auth is wired
- **E2E tests** — Playwright or Puppeteer tests for detection heuristic on known checkout pages
