import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { sellerEarnings } from '@/lib/earnings';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Blueprint 4.10 — a seller's own realized earnings, by year (the data behind a 1099-K). Read-only; a
// seller reads only their own earnings.
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`earnings:${wallet}`, { limit: 30, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const summary = await sellerEarnings(wallet);
  return NextResponse.json(summary);
}
