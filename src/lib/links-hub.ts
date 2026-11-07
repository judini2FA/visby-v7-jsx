// Pure helpers for the /links hub: input validation and identity-state rules. No I/O here so the rules
// are unit-testable; DB work lives in links-hub-server.ts.

export const VID_COOKIE = 'vby_vid';
export const SID_COOKIE = 'vby_sid';
export const SESSION_IDLE_SEC = 30 * 60;
export const VISITOR_TTL_SEC = 395 * 24 * 60 * 60;

export type VisitorStatus = 'anonymous' | 'returning' | 'self_reported' | 'known_contact' | 'conflict';
export type MatchSource = 'email_gate' | 'prelaunch' | 'invite';
export type Evidence = 'self_reported' | 'first_party_record' | 'invite_used';

const RANK: Record<Exclude<VisitorStatus, 'conflict'>, number> = {
  anonymous: 0, returning: 1, self_reported: 2, known_contact: 3,
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

// Evidence for a DIFFERENT contact never silently re-points a visitor: it flags a conflict and keeps the
// original link for a human to review (e.g. two people sharing one phone both requesting documents).
export function nextVisitorState(
  cur: { contactId: string | null; status: VisitorStatus },
  inc: { contactId: string; status: Exclude<VisitorStatus, 'conflict' | 'anonymous' | 'returning'> },
): { contactId: string; status: VisitorStatus } {
  if (cur.contactId && cur.contactId !== inc.contactId) return { contactId: cur.contactId, status: 'conflict' };
  if (cur.status === 'conflict') return { contactId: inc.contactId, status: 'conflict' };
  const status = RANK[inc.status] >= RANK[cur.status] ? inc.status : cur.status;
  return { contactId: inc.contactId, status };
}
