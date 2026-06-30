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
export function payoutAction(payoutType: string, destination: string): string {
  return `payout_destination:${payoutType}:${destination || ''}`;
}
export function tallyTransferAction(itemId: string, toWallet: string): string {
  return `transfer_tally:${itemId}:${toWallet}`;
}
