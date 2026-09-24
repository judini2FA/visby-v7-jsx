import { createHash, randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { PRELAUNCH_INTERESTS, REFERRAL_BOOST, type PrelaunchStanding } from '@/lib/prelaunch-shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REF_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function isRefCode(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[a-z0-9]{8}$/.test(raw);
}

export function newRefCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return out;
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`${process.env.PRELAUNCH_KEY ?? 'visby'}:${ip}`).digest('hex').slice(0, 32);
}

export function cleanInterests(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(PRELAUNCH_INTERESTS.map(i => i.id));
  return Array.from(new Set(raw.filter((x): x is string => typeof x === 'string' && allowed.has(x))));
}

export async function waitlistTotal(): Promise<number> {
  const { count } = await createServiceClient().from('prelaunch_signups').select('id', { count: 'exact', head: true });
  return count ?? 0;
}

// Position is join order minus REFERRAL_BOOST per referral. It ignores other people's boosts, so it is a
// motivating estimate, not a strict rank.
export async function standing(refCode: string): Promise<PrelaunchStanding | null> {
  const supabase = createServiceClient();
  const { data: me } = await supabase
    .from('prelaunch_signups')
    .select('ref_code, created_at, interests')
    .eq('ref_code', refCode)
    .maybeSingle();
  if (!me) return null;

  const [ahead, refs, total] = await Promise.all([
    supabase.from('prelaunch_signups').select('id', { count: 'exact', head: true }).lte('created_at', me.created_at),
    supabase.from('prelaunch_signups').select('id', { count: 'exact', head: true }).eq('referred_by', refCode),
    waitlistTotal(),
  ]);
  const referrals = refs.count ?? 0;
  return {
    refCode,
    position: Math.max(1, (ahead.count ?? 1) - referrals * REFERRAL_BOOST),
    total,
    referrals,
    interests: (me.interests as string[] | null) ?? [],
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
