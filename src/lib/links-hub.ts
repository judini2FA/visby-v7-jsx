// Pure helpers for the /links hub: input validation, provider payload normalization and identity-state
// rules. No I/O here so the rules are unit-testable; DB work lives in links-hub-server.ts.

export const VID_COOKIE = 'vby_vid';
export const SID_COOKIE = 'vby_sid';
export const SESSION_IDLE_SEC = 30 * 60;
export const VISITOR_TTL_SEC = 395 * 24 * 60 * 60;

export type VisitorStatus = 'anonymous' | 'returning' | 'provider_match' | 'known_contact' | 'authenticated' | 'conflict';
export type MatchSource = 'rb2b' | 'warmly' | 'google' | 'prelaunch' | 'invite';
export type Evidence = 'authenticated' | 'first_party_record' | 'provider_match' | 'invite_used';

const RANK: Record<Exclude<VisitorStatus, 'conflict'>, number> = {
  anonymous: 0, returning: 1, provider_match: 2, known_contact: 3, authenticated: 4,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const isCampaign = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(v);
export const isInviteToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{22}$/.test(v);

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

function cleanText(raw: unknown, max = 200): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  return s ? s.slice(0, max) : null;
}

export function cleanLinkedIn(raw: unknown): string | null {
  const s = cleanText(raw, 300);
  if (!s) return null;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    if (!/(^|\.)linkedin\.com$/.test(u.hostname)) return null;
    return `https://www.linkedin.com${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyUa(ua: string): { device: string; browser: string } {
  const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : ua ? 'desktop' : 'unknown';
  const browser =
    /Edg\//.test(ua) ? 'edge'
    : /SamsungBrowser/.test(ua) ? 'samsung'
    : /CriOS|Chrome\//.test(ua) ? 'chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'firefox'
    : /Safari\//.test(ua) ? 'safari'
    : /bot|crawl|spider/i.test(ua) ? 'bot'
    : 'other';
  return { device, browser };
}

export function referrerHost(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try { return new URL(raw).hostname.slice(0, 120); } catch { return null; }
}

export type ProviderIdentity = {
  email: string | null;
  linkedin: string | null;
  name: string | null;
  company: string | null;
  title: string | null;
  capturedUrl: string | null;
};

// RB2B and Warmly webhooks share the same human-readable key names (documented sample payloads);
// Warmly adds more. Payload shape is vendor-fixed, so mapping happens here.
export function normalizeProvider(body: Record<string, unknown>): ProviderIdentity {
  const first = cleanText(body['First Name'], 80);
  const last = cleanText(body['Last Name'], 80);
  return {
    email: cleanEmail(body['Business Email'] ?? body['Email'] ?? body['email']),
    linkedin: cleanLinkedIn(body['LinkedIn URL']),
    name: [first, last].filter(Boolean).join(' ') || null,
    company: cleanText(body['Company Name']),
    title: cleanText(body['Title']),
    capturedUrl: cleanText(body['Captured URL'] ?? body['Session URL'], 500),
  };
}

// An invite token can only tie a provider hit to an invite if the vendor captured the URL while it still
// carried ?i=. The page strips it after the first beacon, so this mostly matches nothing — by design it is
// recorded as evidence that the invite link was used, never as proof of who the visitor is.
export function inviteTokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const t = new URL(url).searchParams.get('i');
    return isInviteToken(t) ? t : null;
  } catch {
    return null;
  }
}

// Strong evidence for a DIFFERENT contact never silently re-points a visitor: it flags a conflict and
// keeps the original link for a human to review.
export function nextVisitorState(
  cur: { contactId: string | null; status: VisitorStatus },
  inc: { contactId: string; status: Exclude<VisitorStatus, 'conflict' | 'anonymous' | 'returning'> },
): { contactId: string; status: VisitorStatus } {
  if (cur.contactId && cur.contactId !== inc.contactId) return { contactId: cur.contactId, status: 'conflict' };
  if (cur.status === 'conflict') return { contactId: inc.contactId, status: 'conflict' };
  const status = RANK[inc.status] >= RANK[cur.status] ? inc.status : cur.status;
  return { contactId: inc.contactId, status };
}

export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function vendorAllowed(o: { gpc: boolean; dnt: boolean; choice: 'accepted' | 'declined' | null; mode: 'notice' | 'opt_in' }): boolean {
  if (o.gpc || o.dnt || o.choice === 'declined') return false;
  return o.mode === 'notice' || o.choice === 'accepted';
}
