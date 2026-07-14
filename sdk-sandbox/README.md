# Visby SDK burner merchant

A throwaway test storefront for the **Pay with Visby** SDK. It plays a real third-party merchant:
holds your secret key server-side, creates real checkout sessions, and embeds the real
`<visby-button>` so you can run a full test purchase — test items, serial-number logging, test checkout —
end to end, minting a real (devnet) Tally on completion.

No `npm install`. Node 18+ only.

## 1. Get a merchant secret key
Sign in at **https://visby.me/merchant** → create a merchant → copy the `sk_visby_…` **secret key**
(shown once). Optionally set the merchant's webhook URL to a **https://webhook.site** URL to watch
webhooks land.

## 2. Run the sandbox
```bash
VISBY_SECRET_KEY=sk_visby_YOURKEY node sdk-sandbox/server.mjs
```
Then open **http://localhost:4000**.

### Options (env vars)
| var | default | notes |
|-----|---------|-------|
| `VISBY_SECRET_KEY` | — | **required** — your merchant secret from /merchant |
| `VISBY_BASE` | `https://visby.me` | point at `http://localhost:3000` to test a locally-running Visby |
| `PORT` | `4000` | sandbox port |

## 3. Test a purchase
1. Each card is a test item with an **auto-generated unique serial** (so you never collide with an
   already-minted serial). Edit the serial if you want.
2. Click **Prepare & get button** → the sandbox server creates a checkout session with your secret key
   and mounts the real Visby button.
3. Click **Pay with Visby** → pay in the popup with Stripe test card **4242 4242 4242 4242** (any
   future expiry / CVC / ZIP).
4. On success the **Serial log** row flips to `minted ✓` and shows the `order_id` → Tally NFT address.
5. **Add a custom test item** with your own name/price to try more serials.

The **Serial log** table traces every test serial → session id → order → minted NFT, which is the
serial-number-logging view for verifying the SDK.

## Notes
- Your secret key stays on the sandbox server — it is never sent to the browser (correct SDK model).
- **Webhooks:** the SDK POSTs signed events (`Visby-Signature: t=…,v1=<HMAC-SHA256>` over
  `timestamp.body`). A public sender can't reach `localhost`, so to watch webhooks set the merchant's
  webhook URL to a **webhook.site** URL, or tunnel with ngrok. This sandbox does not receive webhooks.
- Everything runs on **sandbox/test keys + devnet** today — no real money, no mainnet mint.
- Error responses from Visby (401 bad key, 422 rejected serial, 429 rate-limit) pass straight through
  to the Serial log so you can see them.

## Troubleshooting
- **"No VISBY_SECRET_KEY set"** — restart with the env var (step 2).
- **401 in the log** — the secret key is wrong or from a different environment; re-copy from /merchant.
- **422 serial_rejected** — the serial hit the brand registry; use a different one (the auto serials avoid this).
- **Popup blocked** — allow popups for `localhost:4000`; the button must be clicked by hand (browsers
  block programmatic popups).
