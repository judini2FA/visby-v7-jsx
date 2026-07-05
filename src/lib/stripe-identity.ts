import Stripe from 'stripe';
import crypto from 'crypto';

// Blueprint 6.1 — KYC via Stripe Identity (replaces the Persona adapter; Civic dropped). Keeps the same
// fail-closed, webhook-canonical architecture: /api/kyc/start opens a Stripe-hosted verification page,
// and the /api/kyc/webhook result is the source of truth for a wallet's kyc_status. Fail-soft creation
// (returns null when unusable) so the flow stays dormant until Judah enables Identity on the Stripe
// account. Identity has no separate API key — it rides the existing STRIPE_SECRET_KEY once enabled.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const IDENTITY_WEBHOOK_SECRET = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;

export function identityWebhookConfigured(): boolean {
  return !!IDENTITY_WEBHOOK_SECRET;
}

// Create a hosted verification session bound to the wallet (metadata.wallet → the webhook resolves who
// completed it) and return the Stripe-hosted URL the user opens. Returns null on any failure — most
// importantly when Identity isn't yet enabled on the account, so /api/kyc/start degrades to a clean 503.
export async function createIdentitySession(args: {
  wallet: string;
  accountType: 'personal' | 'business';
  returnUrl: string;
}): Promise<{ sessionId: string; url: string } | null> {
  try {
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      return_url: args.returnUrl,
      metadata: { wallet: args.wallet, account_type: args.accountType, reference_id: args.wallet },
      options: { document: { require_matching_selfie: true } },
    });
    if (!session.id || !session.url) return null;
    return { sessionId: session.id, url: session.url };
  } catch {
    return null;
  }
}

export type IdentityWebhook = { verified: boolean; event: Stripe.Event };

// Verify + parse a Stripe Identity webhook. Uses the DEDICATED Identity endpoint secret (a separate
// Stripe webhook endpoint → /api/kyc/webhook, so KYC stays isolated from the payments webhook). Fails
// closed: no secret / bad signature → { verified:false }, so an unsigned call is never trusted.
export function verifyIdentityWebhook(rawBody: string, sigHeader: string | null): IdentityWebhook | null {
  if (!IDENTITY_WEBHOOK_SECRET || !sigHeader) return null;
  try {
    const event = stripe.webhooks.constructEvent(rawBody, sigHeader, IDENTITY_WEBHOOK_SECRET);
    return { verified: true, event };
  } catch {
    return null;
  }
}

// Belt-and-suspenders: on a `verified` event, re-fetch the session from Stripe (source of truth) rather
// than trusting the webhook body alone, before approving. Returns the authoritative status string.
export async function fetchIdentityStatus(sessionId: string): Promise<string | null> {
  try {
    const s = await stripe.identity.verificationSessions.retrieve(sessionId);
    return s.status ?? null;
  } catch {
    return null;
  }
}

// (kept for parity with the old adapter's export surface; unused constant-time helper if needed later)
export function timingSafeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
