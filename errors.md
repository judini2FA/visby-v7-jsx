# Visby — Test Error Log (Phase 12)

> Judah's running list of every error/bug found while testing the app. Add errors here (or just tell Claude
> in chat and they get logged). Claude triages → fixes → moves the entry to **Fixed** with the fix noted.
> Blueprint **Phase 12** gates on this list being clean (zero open S0/S1).

## How to log an error
- Format: `- [ ] E<n> — <route/screen>: <what happens> · expected: <what should happen> · sev: S0/S1/S2/S3`
- Severity:
  - **S0** — crash, money moves wrong, or data loss (drop everything)
  - **S1** — blocks a core flow (can't sign up / buy / list / pay out)
  - **S2** — a feature is broken but there's a workaround
  - **S3** — polish / cosmetic / copy
- Screenshots or the exact steps help. A wallet address / order id makes money bugs findable.

---

## OPEN

### S0 — crash / money / data loss
- (none)

### S1 — blocks a core flow
- (none)

### S2 — broken, has a workaround
- (none)

### S3 — polish / hardening
- (none)

---

## FIXED
<!-- Claude moves entries here with: E<n> — <what it was> → FIX: <what changed> (commit) -->
- **E1** — Sell/Mint photo cutout: auto background-removal "didn't work at all" and there was no manual fallback · sev S2 → **FIXED 2026-07-07** (`005aad8`): the inline cutout swallowed every failure silently (no message, no fallback). Built `src/components/cutout-editor.tsx` — a real editor: auto → "Looks good?" confirm → manual mode (tap-to-erase backdrop by colour tolerance + erase/restore brushes + undo, zero network dep so a cutout is always reachable). Wired into dashboard/seller + mint; removed the dead `photo-cutout-picker.tsx`.
- **E2** — Cutout images rendered tiny / floating in the product frame · sev S3 → **FIXED 2026-07-07** (`f1a61ff`, `33f7118`): background removal leaves the subject floating in the original frame's transparent margins. Upload now trims the transparent border with sharp (verified 200×200 → subject bbox); listing card / item hero / profile thumb render the trimmed PNG `contain` at full frame size; dropped the grey `--surface-bg` behind cutouts so they sit on the page background (no grey square in dark mode).
- **E3** — Cutout auto crashed with "url.replace is not a function" (persisted after a first `publicPath` attempt) · sev S2 → **FIXED 2026-07-07** (`8ddeafa`): ROOT CAUSE (proven via a browser repro on a throwaway no-auth page) = onnxruntime-web (pulled in by @imgly) runs `new URL(x, import.meta.url)` at module scope; Next's webpack rewrites it to its `RelativeURL` runtime helper, which calls `url.replace()` on a non-string. FIX = `next.config.js` webpack rule `{ test: /onnxruntime-web…/, parser: { url: false } }` so the call runs natively (import.meta.url is a real string). VERIFIED end-to-end in the browser: model+wasm download → ORT init → inference → PNG output. Also switched to `isnet_quint8` (42MB vs 84MB) to halve first-load download.
- **OPS note (not a code bug)** — the E1/E2 fixes appeared to "work locally but not on the web": the commits had been made locally but never `git push`ed, so Vercel built stale code. Resolved by pushing (origin/main advanced). Habit going forward: push after each commit unless told otherwise.
- **H1** — step-up action-string `:`-join collision (`src/lib/step-up-shared.ts`): a field containing `:` could shift the delimiter and let one signed step-up match a different action. → **FIXED 2026-07-07**: percent-encode each field (`encodeURIComponent`) so a `:` becomes `%3A` and can't move a field boundary. Zero behavior change for real inputs (base58/alnum/`-` are unencoded); unit test now asserts no-collision. Was non-exploitable; hardened while step-up is dark.
