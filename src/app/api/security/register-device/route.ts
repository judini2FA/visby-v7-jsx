import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { recordDeviceSession } from '@/lib/device-sessions';
import { logSecurityEvent } from '@/lib/security-audit';
import { emailWallet } from '@/lib/email';
import { newDeviceEmail } from '@/lib/email-templates';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Called once per session on sign-in (SecurityBootstrap). Records the device keyed on the stable Privy
// user_id, and fires the "new device" audit + email only when this user hasn't seen the device's
// fingerprint before (so re-login on a known device stays quiet).
export async function POST(req: Request) {
  const rl = await rateLimit(`regdev:${clientIp(req)}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

  let platform: string | null = null;
  let ua: string | null = null;
  try {
    const b = await req.json();
    platform = typeof b?.platform === 'string' ? b.platform.slice(0, 120) : null;
    ua = typeof b?.ua === 'string' ? b.ua.slice(0, 400) : null;
  } catch { /* body optional */ }
  ua = ua ?? req.headers.get('user-agent');
  const ip = clientIp(req);
  const wallet = ctx.wallets[0] ?? null;

  // recordDeviceSession derives the stable device fingerprint (platform + browser family, not the raw
  // UA string) itself — see src/lib/device-sessions.ts for why (POL6).
  const { isNewDevice } = await recordDeviceSession({
    userId: ctx.userId, session_id: ctx.sessionId, wallet, user_agent: ua, platform, ip,
  });
  if (isNewDevice && wallet) {
    void logSecurityEvent({ wallet, event: 'sign_in_new_device', detail: { platform }, ip, user_agent: ua });
    void emailWallet(wallet, newDeviceEmail({ platform, userAgent: ua, ip }));
  }
  return NextResponse.json({ ok: true });
}
