import { createServiceClient } from '@/lib/supabase/service';

// App-side device/session registry, keyed on the STABLE Privy user_id (a user has multiple linked
// wallets in a non-deterministic order, so keying on a wallet silently mis-targets revocation).
// Privy owns the real session lifetime; this layer gives the user visibility ("active sessions") and a
// real "log out other devices" — getAuthedContext rejects a revoked session_id, so a revoked device
// loses access to the Visby API even while its Privy token is still technically valid.

// Sent to the client (no ip — that stays server-side for audit/email only).
export type DeviceSession = {
  session_id: string;
  user_agent: string | null;
  platform: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

const PUBLIC_COLS = 'session_id, user_agent, platform, created_at, last_seen_at, revoked_at';

function normalizedPlatform(platform: string | null | undefined): string {
  return (platform ?? '').trim().toLowerCase() || 'unknown';
}

// Browser family only — deliberately drops every version/build number. POL6 root cause: the old
// fingerprint hashed the RAW user_agent string, which drifts every time a browser auto-updates (Chrome
// ships a new build every few weeks; Safari/WebKit bumps with each macOS/iOS point release) or when the
// same device is used via a different browser context (in-app webview vs standalone browser). Each drift
// produced a brand-new hash, so the fingerprint-based dedupe added in wave 2 could never actually collapse
// those rows — the same physical device kept re-appearing as a "new" one in Active Sessions.
function browserFamily(userAgent: string | null | undefined): string {
  const u = (userAgent ?? '').toLowerCase();
  if (!u) return 'unknown';
  if (u.includes('edg/') || u.includes('edga/') || u.includes('edgios/')) return 'edge';
  if (u.includes('opr/') || u.includes('opios/') || u.includes('opera')) return 'opera';
  if (u.includes('fxios') || u.includes('firefox')) return 'firefox';
  if (u.includes('crios') || u.includes('chrome') || u.includes('chromium')) return 'chrome';
  if (u.includes('safari')) return 'safari';
  return 'other';
}

// Stable device identity: platform + browser family (NOT the full UA string). Exported so
// register-device and this module always compute it the exact same way.
export function deviceFingerprint(platform: string | null | undefined, userAgent: string | null | undefined): string {
  return `${normalizedPlatform(platform)}|${browserFamily(userAgent)}`;
}

// Groups rows that represent the same physical device. ALWAYS recomputed from platform/user_agent
// (never trusts a stored `fingerprint` column) so legacy rows written with the old, unstable
// hash-of-raw-UA algorithm still collapse correctly under the new scheme — no backfill/migration needed.
function deviceKeyOf(row: Pick<DeviceSession, 'session_id' | 'platform' | 'user_agent'>): string {
  // No fingerprint and no platform/user-agent captured at all — nothing to group on, so treat this row
  // as its own device rather than silently merging unrelated unknown-device sessions together.
  if (!row.platform && !row.user_agent) return `sid:${row.session_id}`;
  return deviceFingerprint(row.platform, row.user_agent);
}

// Returns true only if we can PROVE the session is revoked. Any error (table missing pre-migration,
// DB hiccup) returns false — this is on the auth hot path and must fail OPEN, never lock everyone out.
// session_id is globally unique per Privy session, so no user scoping is needed here.
export async function isSessionRevoked(sessionId: string | null | undefined): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('device_sessions')
      .select('session_id')
      .eq('session_id', sessionId)
      .not('revoked_at', 'is', null)
      .limit(1);
    if (error) {
      // Fail open, but make the silent re-admission observable rather than invisible.
      if (process.env.NODE_ENV !== 'production') console.debug('isSessionRevoked degraded (fail-open)', error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

// Records (or refreshes) this login's device row. Returns isNewDevice = true only when this user has not
// seen this device before (by platform+browser-family), so a fresh re-login on the SAME device doesn't
// re-alert. Fail-soft.
//
// POL6 fix: previously this always INSERTed a new row keyed on the fresh Privy session_id (upsert
// onConflict was 'user_id,session_id', which every re-login trivially satisfies as a NEW row), relying
// entirely on list-time dedupe to hide the resulting duplicates — and that dedupe silently failed once the
// fingerprint drifted (see deviceFingerprint above). Now: if an active row already represents the SAME
// device (by the stable platform+browser-family key), that row is UPDATED in place — its session_id is
// replaced with the new one — so the device stays a single row from the moment it first registers, instead
// of relying on cleanup after the fact.
export async function recordDeviceSession(args: {
  userId: string;
  session_id: string;
  wallet?: string | null;
  user_agent?: string | null;
  platform?: string | null;
  ip?: string | null;
}): Promise<{ isNewDevice: boolean }> {
  if (!args.userId || !args.session_id) return { isNewDevice: false };
  try {
    const supabase = createServiceClient();
    const fingerprint = deviceFingerprint(args.platform, args.user_agent);
    const myRow = { session_id: args.session_id, platform: args.platform ?? null, user_agent: args.user_agent ?? null };
    const myKey = deviceKeyOf(myRow);

    const { data: active } = await supabase
      .from('device_sessions')
      .select('session_id, platform, user_agent')
      .eq('user_id', args.userId)
      .is('revoked_at', null);
    const rows = (active ?? []) as { session_id: string; platform: string | null; user_agent: string | null }[];

    // Nothing to group on (no platform/UA signal at all) — can't tell if this is a known device, so stay
    // silent rather than guess (matches the old fail-safe default of isNewDevice = false).
    const hasSignal = !!(args.platform || args.user_agent);
    const sameDeviceRow = hasSignal
      ? rows.find((r) => r.session_id !== args.session_id && deviceKeyOf(r) === myKey)
      : undefined;
    const isNewDevice = hasSignal && !sameDeviceRow && !rows.some((r) => r.session_id === args.session_id);

    if (sameDeviceRow) {
      const { error: updateError } = await supabase
        .from('device_sessions')
        .update({
          session_id:   args.session_id,
          wallet:       args.wallet ?? null,
          fingerprint,
          user_agent:   args.user_agent ?? null,
          platform:     args.platform ?? null,
          ip:           args.ip ?? null,
          last_seen_at: new Date().toISOString(),
        })
        .eq('user_id', args.userId)
        .eq('session_id', sameDeviceRow.session_id);
      // Rare race: another row already occupies this exact session_id (PK collision) — fall back to
      // revoking the stale duplicate instead of silently leaving both rows around.
      if (updateError) {
        void supabase
          .from('device_sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('user_id', args.userId)
          .eq('session_id', sameDeviceRow.session_id)
          .then(() => {}, () => {});
      }
    } else {
      // Atomic: a concurrent first sign-in can't collide on the PK. created_at is omitted so it keeps the
      // insert default and isn't reset on the heartbeat update.
      await supabase.from('device_sessions').upsert(
        {
          user_id:      args.userId,
          session_id:   args.session_id,
          wallet:       args.wallet ?? null,
          fingerprint,
          user_agent:   args.user_agent ?? null,
          platform:     args.platform ?? null,
          ip:           args.ip ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,session_id' },
      );
    }
    return { isNewDevice };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.debug('recordDeviceSession skipped', err);
    return { isNewDevice: false };
  }
}

// A user re-authenticating (token refresh, re-login, new tab) gets a fresh Privy session_id each time,
// but on the SAME physical browser/device. recordDeviceSession now collapses those onto one row going
// forward, but this collapses any legacy rows too (pre-fix duplicates, or a rare insert race) down to one
// entry: the most-recently-seen session_id represents the device in the UI and in revocation.
function dedupeByDevice(rows: DeviceSession[]): { deduped: DeviceSession[]; staleSessionIds: string[] } {
  const byDevice = new Map<string, DeviceSession>();
  for (const row of rows) {
    const key = deviceKeyOf(row);
    const existing = byDevice.get(key);
    if (!existing || row.last_seen_at > existing.last_seen_at) byDevice.set(key, row);
  }
  const winners = new Set(Array.from(byDevice.values()).map((r) => r.session_id));
  const staleSessionIds = rows.filter((r) => !winners.has(r.session_id)).map((r) => r.session_id);
  const deduped = Array.from(byDevice.values()).sort((a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1));
  return { deduped, staleSessionIds };
}

export async function listDeviceSessions(userId: string): Promise<DeviceSession[]> {
  if (!userId) return [];
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('device_sessions')
      .select(PUBLIC_COLS)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false });
    const rows = (data ?? []) as DeviceSession[];
    const { deduped, staleSessionIds } = dedupeByDevice(rows);

    // Clean up any legacy duplicates (rows that group with an already-represented device) so they stop
    // resurfacing on every subsequent list call. Best-effort — a failure here must never break the read.
    if (staleSessionIds.length > 0) {
      void supabase
        .from('device_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('revoked_at', null)
        .in('session_id', staleSessionIds)
        .then(() => {}, () => {});
    }

    return deduped;
  } catch {
    return [];
  }
}

// Revoke one session, or every session for the user EXCEPT keepSessionId ("log out other devices").
// Returns the number of rows actually revoked so the caller can avoid success-theater + only audit real
// revocations.
//
// listDeviceSessions collapses multiple session_id rows from the same physical device into one entry
// (see dedupeByDevice), so revoking "one" device must revoke every underlying session_id that shares its
// device identity — otherwise a stale sibling row (same device, older session_id) survives and the
// device silently reappears in the list right after "Log out".
export async function revokeDeviceSessions(args: {
  userId: string;
  sessionId?: string;        // revoke this session's whole device group
  keepSessionId?: string;    // revoke all other devices, keep this session's device
}): Promise<{ ok: boolean; count: number }> {
  if (!args.userId) return { ok: false, count: 0 };
  try {
    const supabase = createServiceClient();

    // Pull every active row once, then resolve device groups in JS — safer than a raw NOT IN string
    // and cheap (a single user's active-session count is always small).
    const { data: active, error: fetchError } = await supabase
      .from('device_sessions')
      .select('session_id, platform, user_agent')
      .eq('user_id', args.userId)
      .is('revoked_at', null);
    if (fetchError) return { ok: false, count: 0 };
    const rows = (active ?? []) as { session_id: string; platform: string | null; user_agent: string | null }[];

    let idsToRevoke: string[];
    if (args.sessionId) {
      const target = rows.find((r) => r.session_id === args.sessionId);
      if (!target) return { ok: false, count: 0 };
      const key = deviceKeyOf(target);
      idsToRevoke = rows.filter((r) => deviceKeyOf(r) === key).map((r) => r.session_id);
    } else if (args.keepSessionId) {
      const keep = rows.find((r) => r.session_id === args.keepSessionId);
      const keepKey = keep ? deviceKeyOf(keep) : null;
      idsToRevoke = rows.filter((r) => r.session_id !== args.keepSessionId && (!keepKey || deviceKeyOf(r) !== keepKey)).map((r) => r.session_id);
    } else {
      return { ok: false, count: 0 };
    }
    if (idsToRevoke.length === 0) return { ok: true, count: 0 };

    const { data, error } = await supabase
      .from('device_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', args.userId)
      .is('revoked_at', null)
      .in('session_id', idsToRevoke)
      .select('session_id');
    if (error) return { ok: false, count: 0 };
    return { ok: true, count: data?.length ?? 0 };
  } catch {
    return { ok: false, count: 0 };
  }
}
