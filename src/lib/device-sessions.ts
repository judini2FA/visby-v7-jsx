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

// Atomic upsert of the (user_id, session) row. Returns isNewDevice = true only when this user has not
// seen this device fingerprint before (so a fresh re-login on the SAME device doesn't re-alert). Fail-soft.
export async function recordDeviceSession(args: {
  userId: string;
  session_id: string;
  wallet?: string | null;
  fingerprint?: string | null;
  user_agent?: string | null;
  platform?: string | null;
  ip?: string | null;
}): Promise<{ isNewDevice: boolean }> {
  if (!args.userId || !args.session_id) return { isNewDevice: false };
  try {
    const supabase = createServiceClient();

    // New-device alert is driven by the device fingerprint, not the per-login session_id, so re-login
    // on a known device stays quiet. Checked before the upsert (the tiny race only risks a duplicate
    // alert, never a missed enforcement).
    let isNewDevice = false;
    if (args.fingerprint) {
      const { data: prior } = await supabase
        .from('device_sessions')
        .select('session_id')
        .eq('user_id', args.userId)
        .eq('fingerprint', args.fingerprint)
        .is('revoked_at', null)
        .neq('session_id', args.session_id)
        .limit(1);
      isNewDevice = !(Array.isArray(prior) && prior.length > 0);
    }

    // Atomic: a concurrent first sign-in can't collide on the PK. created_at is omitted so it keeps the
    // insert default and isn't reset on the heartbeat update.
    await supabase.from('device_sessions').upsert(
      {
        user_id:      args.userId,
        session_id:   args.session_id,
        wallet:       args.wallet ?? null,
        fingerprint:  args.fingerprint ?? null,
        user_agent:   args.user_agent ?? null,
        platform:     args.platform ?? null,
        ip:           args.ip ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,session_id' },
    );
    return { isNewDevice };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.debug('recordDeviceSession skipped', err);
    return { isNewDevice: false };
  }
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
    return (data ?? []) as DeviceSession[];
  } catch {
    return [];
  }
}

// Revoke one session, or every session for the user EXCEPT keepSessionId ("log out other devices").
// Returns the number of rows actually revoked so the caller can avoid success-theater + only audit real
// revocations.
export async function revokeDeviceSessions(args: {
  userId: string;
  sessionId?: string;        // revoke just this one
  keepSessionId?: string;    // revoke all others, keep this one
}): Promise<{ ok: boolean; count: number }> {
  if (!args.userId) return { ok: false, count: 0 };
  try {
    const supabase = createServiceClient();
    let q = supabase
      .from('device_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', args.userId)
      .is('revoked_at', null);
    if (args.sessionId) q = q.eq('session_id', args.sessionId);
    else if (args.keepSessionId) q = q.neq('session_id', args.keepSessionId);
    const { data, error } = await q.select('session_id');
    if (error) return { ok: false, count: 0 };
    return { ok: true, count: data?.length ?? 0 };
  } catch {
    return { ok: false, count: 0 };
  }
}
