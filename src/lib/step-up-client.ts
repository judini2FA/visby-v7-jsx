import bs58 from 'bs58';
import { buildStepUpMessage, type StepUpProof } from '@/lib/step-up-shared';

// Client toggle: only sign + attach a step-up proof once enforcement is rolled out, so until then the
// money flows keep their current UX (no extra signature prompt). Flip alongside the server's
// STEP_UP_ENFORCED.
export const STEP_UP_ON = process.env.NEXT_PUBLIC_STEP_UP_ENFORCED === '1';

// Produce a step-up proof by signing an action-bound challenge with the user's Solana embedded wallet.
// Signing triggers Privy's MFA prompt when the user has enrolled MFA. `signMessage` is the
// ConnectedSolanaWallet.signMessage from useSolanaWallets(). Throws if the user cancels or MFA fails.
export async function createStepUpProof(args: {
  action: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<StepUpProof> {
  const nonce = crypto.randomUUID();
  const message = buildStepUpMessage(args.action, nonce, Date.now());
  const sig = await args.signMessage(new TextEncoder().encode(message));
  return { message, signature: bs58.encode(sig) };
}

export function stepUpHeader(proof: StepUpProof): Record<string, string> {
  return { 'x-visby-stepup': JSON.stringify(proof) };
}
