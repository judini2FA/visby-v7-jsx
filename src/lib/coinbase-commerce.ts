import crypto from 'crypto';

// Coinbase Commerce hosted-charge client (REST — no SDK dep, mirrors src/lib/moov.ts's shape). A SECOND,
// max-compatibility crypto checkout rail (blueprint 12b B2b — Judah: "both, max compatibility") alongside
// the native SOL/USDC/Li.Fi flow: Coinbase's hosted page accepts any wallet/exchange, not just Solana.
// Fail-soft: coinbaseCommerceConfigured() is false until the API key lands, and callers 503 accordingly.
// Wired into checkout as an ADDITIONAL tab behind NEXT_PUBLIC_COINBASE_ENABLED — the existing SOL/USDC/
// Li.Fi tabs and the Stripe/Moov CARD tab are untouched either way.

const API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
const WEBHOOK_SECRET = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
const API = 'https://api.commerce.coinbase.com';
const API_VERSION = '2018-03-22';

export function coinbaseCommerceConfigured(): boolean {
  return !!API_KEY;
}

export interface CoinbaseCharge {
  id: string;
  code: string;
  hosted_url: string;
}

// Creates a fixed-price hosted charge. amountUsd must already be the SERVER-resolved price (the caller
// runs it through resolveCheckoutPrice first, same as every other rail) — this function never re-prices.
// metadata rides along on the charge and is echoed back verbatim on every webhook event, so the webhook
// can fulfill WITHOUT re-resolving the price (mirrors how the Moov/Stripe metadata carries item_id +
// buyer_wallet through to settlement).
export async function createCharge(args: {
  name: string;
  description?: string;
  amountUsd: number;
  metadata: Record<string, string>;
}): Promise<CoinbaseCharge> {
  if (!API_KEY) throw new Error('coinbase_not_configured');
  const res = await fetch(`${API}/charges`, {
    method: 'POST',
    headers: {
      'X-CC-Api-Key': API_KEY,
      'X-CC-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: args.name,
      description: args.description ?? args.name,
      pricing_type: 'fixed_price',
      local_price: { amount: args.amountUsd.toFixed(2), currency: 'USD' },
      metadata: args.metadata,
    }),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`coinbase_api POST /charges ${res.status}: ${text}`);
  const data = text ? JSON.parse(text) : {};
  const charge = data?.data;
  if (!charge?.id || !charge?.hosted_url) throw new Error('coinbase_api malformed_charge_response');
  return { id: charge.id, code: charge.code, hosted_url: charge.hosted_url };
}

// Coinbase Commerce signs webhooks HMAC-SHA256 over the RAW request body (not the parsed JSON) with the
// per-account webhook shared secret, sent as a hex digest in the `X-CC-Webhook-Signature` header.
// Fail-closed: unconfigured, missing signature, or mismatched length/digest all reject — never trust an
// unverified webhook body enough to fulfill a purchase off it.
export function verifyWebhook(rawBody: string, signatureHeader: string | null | undefined): boolean {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signatureHeader, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
