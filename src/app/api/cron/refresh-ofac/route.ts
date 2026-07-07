export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { refreshOfacSanctions } from '@/lib/ofac';
import { captureMessage } from '@/lib/monitoring';

// Nightly refresh of the OFAC Solana sanctions blocklist (blueprint 6.4). CRON_SECRET timing-safe auth,
// fail-closed on an unset secret — same pattern as the other crons. A failed refresh alerts loudly, so a
// broken feed surfaces long before the 7-day staleness window would start holding payouts.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers.get('x-cron-secret') ?? '');
  if (!provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const r = await refreshOfacSanctions();
  if (!r.ok) {
    captureMessage('error', `[ofac] sanctions refresh FAILED: ${r.error}`, { error: r.error });
    return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: r.count });
}

export const GET = handle;
export const POST = handle;
