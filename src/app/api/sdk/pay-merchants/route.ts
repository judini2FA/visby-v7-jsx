import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { runDueMerchantPayouts } from '@/lib/sdk-merchant-payout';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Blueprint 5.6 — cron-triggered sweep that pays SDK merchants their net (USDC) for minted orders still
// owed. Same shared-secret guard as the other SDK crons: on Vercel, vercel.json wires the schedule and
// Vercel sends `Authorization: Bearer $CRON_SECRET`. Fails closed if CRON_SECRET is unset so it can
// never run unauthenticated (money-moving).
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
    const summary = await runDueMerchantPayouts({ limit: 50 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[sdk/pay-merchants]', err);
    return NextResponse.json({ error: 'Merchant payout sweep failed' }, { status: 500 });
  }
}

// GET so Vercel Cron (which issues GET) can drive it; POST for manual/cron-system invocation.
export const GET = handle;
export const POST = handle;
