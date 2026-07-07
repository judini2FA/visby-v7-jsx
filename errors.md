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
- [ ] H1 — step-up action signing (`src/lib/step-up-shared.ts`): the action strings use a naive `:`-join with no escaping, so a field value containing `:` could collide (e.g. `payoutAction('a:b','c') === payoutAction('a','b:c')`) — in theory letting one signed step-up authorize a different action. **NOT exploitable today** (real fields are constrained: payout type ∈ bank/crypto, wallets are base58, tokens are short symbols) and step-up is dark. Hardening: length-delimit/encode the fields (or JSON) so no value can shift the delimiter. Surfaced by the Phase 11.1 unit tests.

---

## FIXED
<!-- Claude moves entries here with: E<n> — <what it was> → FIX: <what changed> (commit) -->
- (none yet)
