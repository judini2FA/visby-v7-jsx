import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { retryFailedSdkMints } from '@/lib/sdk-mint-retry';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Cron-triggered sweep that re-mints SDK orders whose payment cleared but whose provenance mint failed
// at settle time (status='failed', paid, no NFT). Stateless endpoint guarded by a shared secret. On
// Vercel, vercel.json wires it to a schedule and Vercel sends `Authorization: Bearer $CRON_SECRET`
// automatically; it can also be curl'd with that header. Fails closed if CRON_SECRET is unset so it can
// never run unauthenticated.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers.get('x-cron-secret') ?? '');
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const summary = await retryFailedSdkMints({ limit: 25 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[sdk/retry-mints]', err);
    return NextResponse.json({ error: 'Mint-retry sweep failed' }, { status: 500 });
  }
}

// GET so Vercel Cron (which issues GET) can drive it; POST for manual/cron-system invocation.
export const GET = handle;
export const POST = handle;
