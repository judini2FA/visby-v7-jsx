// Automated business (KYB) verification. Same philosophy as the KYC/Stripe-Identity layer: dark unless a
// real KYB provider is keyed, and it can NEVER wrongly auto-approve — any uncertainty routes to manual
// review. With no provider configured, business verification falls back to ATTESTATION: a complete,
// well-formed submission of real identifiers (legal name + plausible EIN + full address) auto-approves.
// This delivers instant self-serve business accounts today, and upgrades to true EIN-against-IRS
// verification the moment a provider (Middesk / Stripe / etc.) is wired — no route change needed.

export type KybVerdict = 'verified' | 'review' | 'failed' | 'unconfigured';

export function kybConfigured(): boolean {
  return !!process.env.KYB_PROVIDER_KEY;
}

// Ops override: force every submission to manual admin review, regardless of provider/attestation.
export function manualBusinessReview(): boolean {
  return process.env.BUSINESS_VERIFICATION_MANUAL === '1';
}

// Blocks values that CANNOT be a real EIN (never-assigned prefix, degenerate digits). Deliberately
// conservative so it never rejects a legitimate EIN — the strong check is real KYB. An EIN that only
// fails HERE is routed to manual review, not auto-rejected.
export function einLooksValid(ein: string): boolean {
  const digits = ein.replace(/\D/g, '');
  if (digits.length !== 9) return false;
  if (/^(\d)\1{8}$/.test(digits)) return false; // all-same-digit (e.g. 000000000, 111111111)
  if (digits.slice(0, 2) === '00') return false; // prefix 00 is never assigned by the IRS
  return true;
}

type KybInput = { legal_name: string; ein: string; address?: unknown };

// Real EIN↔entity verification. Returns 'unconfigured' until a KYB provider is chosen and wired.
//
// To enable true verification (the proper upgrade, scoped like KYC/Stripe Identity was):
//   1. Pick a KYB vendor (Middesk is the standard; Stripe can verify a company via Connect).
//   2. Set KYB_PROVIDER_KEY and implement the provider call below.
//   3. Middesk is ASYNC — creating a business returns 'open'/pending, then an assessment webhook fires.
//      That needs a companion webhook route (mirror /api/kyc/webhook) that flips the row + calls
//      setBusinessAccount on a verified assessment. Until that exists, a keyed sync call should map
//      pending → 'review' so nothing auto-approves on an unverified 'open' state.
//   4. Map ONLY an explicit pass → 'verified'; explicit fail → 'failed'; everything else → 'review'.
//      Never map an error/timeout to 'verified' or 'failed' (return 'review' — a human decides).
export async function verifyBusinessKyb(_input: KybInput): Promise<KybVerdict> {
  if (!kybConfigured()) return 'unconfigured';
  // No provider implemented yet — fail safe to manual review rather than auto-approving on a keyed
  // but unimplemented provider.
  return 'review';
}
