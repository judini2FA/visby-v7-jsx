import crypto from 'crypto';

// Persona (withpersona.com) identity-verification client. Fail-soft: every call returns null when Persona
// isn't configured, so the whole KYC flow stays dormant until the keys land.

const API_BASE = 'https://withpersona.com/api/v1';
const API_KEY = process.env.PERSONA_API_KEY;
const WEBHOOK_SECRET = process.env.PERSONA_WEBHOOK_SECRET;
const KYC_TEMPLATE = process.env.PERSONA_KYC_TEMPLATE_ID;
const KYB_TEMPLATE = process.env.PERSONA_KYB_TEMPLATE_ID;

export function personaConfigured(): boolean {
  return !!API_KEY;
}

function templateFor(accountType: 'personal' | 'business'): string | undefined {
  return accountType === 'business' ? (KYB_TEMPLATE || KYC_TEMPLATE) : KYC_TEMPLATE;
}

async function generateOneTimeLink(inquiryId: string): Promise<string | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${API_BASE}/inquiries/${encodeURIComponent(inquiryId)}/generate-one-time-link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Persona-Version': '2023-01-05' },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.meta?.['one-time-link'] ?? null;
  } catch {
    return null;
  }
}

// Create an inquiry bound to the user (reference-id = wallet → the webhook can resolve who completed it),
// then mint a one-time link the user opens to verify. Returns null on any failure (fail-soft).
export async function createInquiry(args: { wallet: string; accountType: 'personal' | 'business' }): Promise<{ inquiryId: string; templateId: string; url: string } | null> {
  if (!API_KEY) return null;
  const templateId = templateFor(args.accountType);
  if (!templateId) return null;
  try {
    const res = await fetch(`${API_BASE}/inquiries`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Persona-Version': '2023-01-05',
      },
      body: JSON.stringify({ data: { attributes: { 'inquiry-template-id': templateId, 'reference-id': args.wallet } } }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const inquiryId = json?.data?.id;
    if (!inquiryId) return null;
    const url = await generateOneTimeLink(inquiryId);
    if (!url) return null;
    return { inquiryId, templateId, url };
  } catch {
    return null;
  }
}

// Verify a Persona webhook signature. Header: "t=<unix>,v1=<hmac>" (space-separated sets during secret
// rotation, each with its own pairs). HMAC-SHA256 hex of `${t}.${rawBody}` with the webhook secret,
// constant-time compared against every v1. Returns false when no secret is configured, so an unsigned
// (or wrongly-signed) call to /api/kyc/webhook fails CLOSED rather than being trusted.
export function verifyPersonaWebhook(rawBody: string, header: string | null): boolean {
  if (!WEBHOOK_SECRET || !header) return false;
  try {
    for (const set of header.trim().split(/\s+/)) {
      const pairs: Record<string, string> = {};
      for (const kv of set.split(',')) {
        const i = kv.indexOf('=');
        if (i > 0) pairs[kv.slice(0, i)] = kv.slice(i + 1);
      }
      const t = pairs['t'];
      const v1 = pairs['v1'];
      if (!t || !v1) continue;
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest('hex');
      const a = Buffer.from(expected);
      const b = Buffer.from(v1);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
