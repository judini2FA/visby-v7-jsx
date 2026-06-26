import { createHmac, timingSafeEqual } from 'crypto';

// Stateless, self-contained review-link token: `base64url(payload).base64url(hmacSHA256(payload))`
// where payload = { o: order_id, b: buyer_wallet, e: expiryMs }. No DB row is needed — the HMAC over
// REVIEW_TOKEN_SECRET both authenticates the link and binds it to one order+buyer, and `e` expires it.
// Everything no-ops when the secret is unset (fail-soft, like the rest of the email path).

const SECRET = process.env.REVIEW_TOKEN_SECRET ?? '';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days from delivery

export function reviewTokenConfigured(): boolean {
  return SECRET.length >= 16;
}

function hmac(input: string): string {
  return createHmac('sha256', SECRET).update(input).digest('base64url');
}

export function signReviewToken(orderId: string, buyerWallet: string, ttlMs = DEFAULT_TTL_MS): string | null {
  if (!reviewTokenConfigured()) return null;
  const payload = Buffer.from(JSON.stringify({ o: orderId, b: buyerWallet, e: Date.now() + ttlMs })).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function verifyReviewToken(token: string | null | undefined): { order_id: string; buyer_wallet: string } | null {
  if (!reviewTokenConfigured() || !token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let data: { o?: unknown; b?: unknown; e?: unknown };
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (typeof data.o !== 'string' || typeof data.b !== 'string' || typeof data.e !== 'number') return null;
  if (Date.now() > data.e) return null;
  return { order_id: data.o, buyer_wallet: data.b };
}
