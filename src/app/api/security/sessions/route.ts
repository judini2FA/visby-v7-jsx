import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { listDeviceSessions, revokeDeviceSessions } from '@/lib/device-sessions';
import { logSecurityEvent } from '@/lib/security-audit';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// GET: this user's active sessions + which one is the caller's current device. Keyed on the stable
// Privy user_id, so it works even for a wallet-less (ETH-only) account.
export async function GET(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = await rateLimit(`sessions-get:${ctx.userId}`, { limit: 30, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);
  const sessions = await listDeviceSessions(ctx.userId);
  return NextResponse.json({ sessions, current: ctx.sessionId });
}

// POST: revoke one session, or all others ("log out other devices"). Keyed + rate-limited on the
// token-derived user_id (not IP) so a co-located/NAT'd attacker can't gate a victim's security action,
// and the revoke can only ever touch the caller's own sessions.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = await rateLimit(`sessions:${ctx.userId}`, { limit: 20, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const wallet = ctx.wallets[0] ?? null; // audit recipient only
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');
  const { action, session_id } = await req.json().catch(() => ({}));

  if (action === 'revoke_others') {
    const { ok, count } = await revokeDeviceSessions({ userId: ctx.userId, keepSessionId: ctx.sessionId });
    if (ok && count > 0 && wallet) void logSecurityEvent({ wallet, event: 'sessions_revoked_others', detail: { count }, ip, user_agent: ua });
    return NextResponse.json({ ok, count });
  }
  if (action === 'revoke_one' && typeof session_id === 'string' && session_id) {
    const { ok, count } = await revokeDeviceSessions({ userId: ctx.userId, sessionId: session_id });
    if (!ok) return NextResponse.json({ ok: false }, { status: 500 });
    if (count === 0) return NextResponse.json({ ok: false, error: 'No such session' }, { status: 404 });
    if (wallet) void logSecurityEvent({ wallet, event: 'session_revoked', detail: { session_id }, ip, user_agent: ua });
    return NextResponse.json({ ok: true, count });
  }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
