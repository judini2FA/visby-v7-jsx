// Client-safe step-up challenge format, shared by the server verifier (step-up.ts) and the client
// signer (step-up-client.ts). Keep this free of any server-only imports so it can ship to the browser.

export const STEP_UP_PREFIX = 'Visby security check';
export const STEP_UP_FRESH_MS = 5 * 60 * 1000; // a step-up signature is good for 5 minutes

export type StepUpProof = { message: string; signature: string }; // signature = base58

// Human-readable so the user sees exactly what they're approving in the wallet prompt.
export function buildStepUpMessage(action: string, nonce: string, ts: number): string {
  return `${STEP_UP_PREFIX}\naction: ${action}\nts: ${ts}\nnonce: ${nonce}`;
}
