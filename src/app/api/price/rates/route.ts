export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

// USD spot price per coin, for the crypto price-view (showing listing prices in SOL/ETH/BTC). Cached ~60s
// in-process; fail-soft — returns the last good map (or {}) on error so price displays fall back to USD
// rather than breaking.
let cache: { rates: Record<string, number>; at: number } | null = null;
const TTL_MS = 60_000;
const IDS = 'solana,ethereum,bitcoin';
const TICKER: Record<string, string> = { solana: 'SOL', ethereum: 'ETH', bitcoin: 'BTC' };

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json({ usd: cache.rates });
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${IDS}&vs_currencies=usd`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ usd: cache?.rates ?? {} });
    const data: any = await res.json();
    const rates: Record<string, number> = {};
    for (const [id, ticker] of Object.entries(TICKER)) {
      const v = Number(data?.[id]?.usd);
      if (Number.isFinite(v) && v > 0) rates[ticker] = v;
    }
    if (Object.keys(rates).length) cache = { rates, at: Date.now() };
    return NextResponse.json({ usd: cache?.rates ?? {} });
  } catch {
    return NextResponse.json({ usd: cache?.rates ?? {} });
  }
}
