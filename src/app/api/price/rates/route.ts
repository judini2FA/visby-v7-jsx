export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { coinsUsd } from '@/lib/price-oracle';

// USD spot price per coin, for the crypto price-view (showing listing prices in SOL/ETH/BTC). Served from
// the shared oracle (keyed CoinGecko → fallbacks, ~60s cache, last-good fallback); fail-soft — omits any
// coin with no price so displays fall back to USD rather than breaking.
const TICKER: Record<string, string> = { solana: 'SOL', ethereum: 'ETH', bitcoin: 'BTC' };

export async function GET() {
  const prices = await coinsUsd(Object.keys(TICKER));
  const rates: Record<string, number> = {};
  for (const [id, ticker] of Object.entries(TICKER)) {
    const v = prices[id] ?? 0;
    if (v > 0) rates[ticker] = v;
  }
  return NextResponse.json({ usd: rates });
}
