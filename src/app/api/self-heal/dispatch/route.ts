import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { dispatchQueuedReports } from '@/lib/self-heal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Cron-triggered dispatcher: hands OPEN bug_reports to the self-heal workflow (which opens reviewed
// PRs). Guarded by CRON_SECRET like the other sweeps; Vercel Cron sends `Authorization: Bearer
// $CRON_SECRET`. Fails closed if CRON_SECRET is unset so it can never run unauthenticated.
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
    const summary = await dispatchQueuedReports({ limit: 10, dailyCap: 5 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[self-heal/dispatch]', err);
    return NextResponse.json({ error: 'Dispatch sweep failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
