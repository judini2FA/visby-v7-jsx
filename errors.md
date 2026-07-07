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
- **H1** — step-up action-string `:`-join collision (`src/lib/step-up-shared.ts`): a field containing `:` could shift the delimiter and let one signed step-up match a different action. → **FIXED 2026-07-07**: percent-encode each field (`encodeURIComponent`) so a `:` becomes `%3A` and can't move a field boundary. Zero behavior change for real inputs (base58/alnum/`-` are unencoded); unit test now asserts no-collision. Was non-exploitable; hardened while step-up is dark.
