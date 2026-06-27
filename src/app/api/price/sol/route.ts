export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

// SOL spot price in USD, for converting a fiat amount the user types into the SOL the send actually moves.
// Cached ~60s in-process; fail-soft (returns { usd: null }) so the Pay UI degrades to entering SOL directly
// rather than breaking when the rate source is unavailable.
let cache: { usd: number; at: number } | null = null;
const TTL_MS = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json({ usd: cache.usd });
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ usd: cache?.usd ?? null });
    const data: any = await res.json();
    const usd = Number(data?.solana?.usd);
    if (!Number.isFinite(usd) || usd <= 0) return NextResponse.json({ usd: cache?.usd ?? null });
    cache = { usd, at: Date.now() };
    return NextResponse.json({ usd });
  } catch {
    return NextResponse.json({ usd: cache?.usd ?? null });
  }
}
