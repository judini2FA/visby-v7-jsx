// Client-safe step-up challenge format, shared by the server verifier (step-up.ts) and the client
// signer (step-up-client.ts). Keep this free of any server-only imports so it can ship to the browser.

export const STEP_UP_PREFIX = 'Visby security check';
export const STEP_UP_FRESH_MS = 5 * 60 * 1000; // a step-up signature is good for 5 minutes

export type StepUpProof = { message: string; signature: string }; // signature = base58

// Human-readable so the user sees exactly what they're approving in the wallet prompt.
export function buildStepUpMessage(action: string, nonce: string, ts: number): string {
  return `${STEP_UP_PREFIX}\naction: ${action}\nts: ${ts}\nnonce: ${nonce}`;
}

// Action strings BIND THE DESTINATION, so a step-up proof authorizes the exact target the user reviewed —
// not just the action class. Server + client both build the action from these so the strings can't drift.
// Each variable field is percent-encoded (H1) so a value can never contain the ':' delimiter and shift a
// field boundary — otherwise `payout('a:b','c')` and `payout('a','b:c')` would collide and one signed
// proof could authorize a different target. Real inputs (base58 wallets, 'bank'/'crypto', uuids, short
// symbols, numbers) contain no reserved chars, so the encoded output is identical to the raw value.
const enc = (s: string) => encodeURIComponent(s);
export function payoutAction(payoutType: string, destination: string): string {
  return `payout_destination:${enc(payoutType)}:${enc(destination || '')}`;
}
export function tallyTransferAction(itemId: string, toWallet: string): string {
  return `transfer_tally:${enc(itemId)}:${enc(toWallet)}`;
}
export function sendMoneyAction(toWallet: string, token: string): string {
  return `send_money:${enc(token)}:${enc(toWallet)}`;
}
// Binds the charging wallet + USD amount + asset, so a step-up proof for one saved-card charge can't be
// replayed to pull a different amount (off-session charges move card -> crypto without the card being
// re-entered, so they get the same step-up as a send).
export function onrampChargeAction(wallet: string, usd: number, asset: string): string {
  return `onramp_charge:${enc(asset)}:${enc(String(usd))}:${enc(wallet)}`;
}
