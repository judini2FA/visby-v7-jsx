import crypto from 'crypto';

// Moov card-processing client (REST, not the SDK — REST is stable across SDK version drift and needs
// no extra dep). Fail-soft: moovConfigured() is false until keys land, and callers no-op accordingly.
// Card COLLECTION must happen in the browser via Moov.js (raw PAN never touches our server, PCI-safe);
// this server lib issues the scoped token for that, then handles accounts / capabilities / transfers /
// webhooks / saved-card lookup. Wired into checkout as the CARD tab's sole rail behind
// NEXT_PUBLIC_MOOV_ENABLED — Stripe stays live only as the flag-off fallback and for ACH.

const CLIENT_ID = process.env.MOOV_PUBLIC_KEY;
const CLIENT_SECRET = process.env.MOOV_SECRET_KEY;
const PLATFORM_ACCOUNT_ID = process.env.MOOV_PLATFORM_ACCOUNT_ID;
const WEBHOOK_SECRET = process.env.MOOV_WEBHOOK_SECRET;
const API = 'https://api.moov.io';
const API_VERSION = process.env.MOOV_API_VERSION ?? 'v2026.04.00';

export function moovConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

// OAuth2 client-credentials. Tokens are short-lived + scoped to exactly the actions requested, so we
// mint a fresh narrowly-scoped token per operation. Scopes are '/'-prefixed, space-delimited.
export async function getMoovToken(scopes: string[]): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('moov_not_configured');
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Moov-Version': API_VERSION,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: scopes.join(' ') }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`moov_token_failed ${res.status}: ${await res.text().catch(() => '')}`);
  const d = await res.json();
  return d.access_token as string;
}

async function moovFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Moov-Version': API_VERSION,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`moov_api ${init?.method ?? 'GET'} ${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

export async function createMoovAccount(args: {
  type: 'individual' | 'business';
  name?: { firstName: string; lastName: string };
  email?: string;
  legalBusinessName?: string;
}): Promise<{ accountID: string }> {
  const token = await getMoovToken(['/accounts.write']);
  const profile = args.type === 'business'
    ? { business: { legalBusinessName: args.legalBusinessName ?? 'Visby Seller' } }
    : { individual: { name: args.name ?? { firstName: 'Visby', lastName: 'User' }, ...(args.email ? { email: args.email } : {}) } };
  const data = await moovFetch('/accounts', token, {
    method: 'POST',
    body: JSON.stringify({ accountType: args.type, profile }),
  });
  return { accountID: data.accountID };
}

// Kicks off Moov's KYC/KYB — capabilities move pending → enabled and the outcome arrives via webhook.
export async function requestCapabilities(
  accountID: string,
  capabilities: string[] = ['transfers', 'send-funds', 'collect-funds', 'wallet'],
): Promise<void> {
  const token = await getMoovToken([`/accounts/${accountID}/capabilities.write`]);
  await moovFetch(`/accounts/${accountID}/capabilities`, token, {
    method: 'POST',
    body: JSON.stringify({ capabilities }),
  });
}

// A short-lived cards.write token the BROWSER uses to submit card data straight to Moov (PCI-safe);
// the client gets back a cardID it can hand to our server.
export async function issueCardToken(accountID: string): Promise<string> {
  return getMoovToken([`/accounts/${accountID}/cards.write`, `/accounts/${accountID}/cards.read`]);
}

// A linked card generates payment methods; find the card-payment one to use as a transfer source.
// cardID narrows to one specific card (a buyer's saved-card account can hold more than one) — omit it
// to keep the prior "first card-payment method on the account" behavior for a fresh single-card link.
export async function findCardPaymentMethod(accountID: string, cardID?: string): Promise<string | null> {
  const token = await getMoovToken([`/accounts/${accountID}/payment-methods.read`]);
  const list = await moovFetch(`/accounts/${accountID}/payment-methods`, token, { method: 'GET' });
  const methods = Array.isArray(list) ? list : [];
  const pm = cardID
    ? methods.find((m: any) => m.paymentMethodType === 'card-payment' && m.card?.cardID === cardID)
    : methods.find((m: any) => m.paymentMethodType === 'card-payment');
  return pm?.paymentMethodID ?? null;
}

// All cards linked to a Moov account — the source of truth for brand/last4/expiration (Moov has no
// "default card" concept of its own; that preference is tracked in our moov_cards table instead).
export async function listMoovCards(accountID: string): Promise<any[]> {
  const token = await getMoovToken([`/accounts/${accountID}/cards.read`]);
  const list = await moovFetch(`/accounts/${accountID}/cards`, token, { method: 'GET' });
  return Array.isArray(list) ? list : [];
}

// The moov-wallet payment method for an account — the collect-to-platform destination for a charge.
export async function findWalletPaymentMethod(accountID: string): Promise<string | null> {
  const token = await getMoovToken([`/accounts/${accountID}/payment-methods.read`]);
  const list = await moovFetch(`/accounts/${accountID}/payment-methods`, token, { method: 'GET' });
  const pm = (Array.isArray(list) ? list : []).find((m: any) => m.paymentMethodType === 'moov-wallet');
  return pm?.paymentMethodID ?? null;
}

// Buyer card payment-method → seller/platform destination, skimming the Visby facilitator fee. The path
// accountID is our PLATFORM account. x-idempotency-key dedupes retries (required).
export async function createMoovTransfer(args: {
  sourcePaymentMethodID: string;
  destinationPaymentMethodID: string;
  amountCents: number;
  facilitatorFeeCents?: number;
  description?: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  waitForRailResponse?: boolean;   // block up to ~15s for the settled status (so we only fulfill on 'completed')
}): Promise<{ transferID: string; status: string }> {
  if (!PLATFORM_ACCOUNT_ID) throw new Error('moov_platform_account_missing');
  const token = await getMoovToken([`/accounts/${PLATFORM_ACCOUNT_ID}/transfers.write`]);
  const data = await moovFetch(`/accounts/${PLATFORM_ACCOUNT_ID}/transfers`, token, {
    method: 'POST',
    headers: {
      'x-idempotency-key': args.idempotencyKey,
      ...(args.waitForRailResponse ? { 'x-wait-for': 'rail-response' } : {}),
    },
    body: JSON.stringify({
      source: { paymentMethodID: args.sourcePaymentMethodID },
      destination: { paymentMethodID: args.destinationPaymentMethodID },
      amount: { currency: 'USD', value: args.amountCents },
      ...(args.facilitatorFeeCents ? { facilitatorFee: { total: args.facilitatorFeeCents } } : {}),
      ...(args.description ? { description: args.description } : {}),
      ...(args.metadata ? { metadata: args.metadata } : {}),
    }),
  });
  return { transferID: data.transferID, status: data.status };
}

// Moov signs webhooks HMAC-SHA512 over `timestamp|nonce|webhookID` (the headers, NOT the body). Fail-closed.
export function verifyMoovWebhook(headers: {
  timestamp?: string | null;
  nonce?: string | null;
  webhookId?: string | null;
  signature?: string | null;
}): boolean {
  if (!WEBHOOK_SECRET) return false;
  const { timestamp, nonce, webhookId, signature } = headers;
  if (!timestamp || !nonce || !webhookId || !signature) return false;
  const expected = crypto.createHmac('sha512', WEBHOOK_SECRET).update(`${timestamp}|${nonce}|${webhookId}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
