export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { coinsUsd } from '@/lib/price-oracle';
import { PAYABLE_TOKENS } from '@/lib/payable-tokens';

// USD spot price per coin, for the crypto price-view (showing listing prices in SOL/ETH/BTC/...). Served
// from the shared oracle (keyed CoinGecko → fallbacks, ~60s cache, last-good fallback); fail-soft — omits
// any coin with no price so displays fall back to USD rather than breaking. cgId → ticker is sourced from
// payable-tokens.ts (single source of truth for what's payable) so the two lists can't drift; USDC has no
// cgId there (pegged 1:1, no swap route) so it's the one manual entry.
const DISPLAY_CRYPTO = ['SOL', 'ETH', 'BTC', 'USDT', 'DAI', 'LINK', 'UNI', 'POL', 'AVAX', 'BNB', 'ARB', 'OP'];
const TICKER: Record<string, string> = { 'usd-coin': 'USDC' };
for (const symbol of DISPLAY_CRYPTO) {
  const cgId = PAYABLE_TOKENS.find((t) => t.symbol === symbol)?.cgId;
  if (cgId) TICKER[cgId] = symbol;
}

// Full fiat map — one upstream call to a free, no-key endpoint (open.er-api.com), cached in-process
// for ~1h (fiat barely moves intra-day, and this is a free tier we shouldn't hammer), with a last-good
// fallback if the upstream call ever fails so a bad response never blanks every fiat rate at once.
const FIAT_URL = 'https://open.er-api.com/v6/latest/USD';
const FIAT_TTL_MS = 60 * 60 * 1000;
let fiatCache: { at: number; rates: Record<string, number> } | null = null;

async function fetchFiatRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (fiatCache && now - fiatCache.at < FIAT_TTL_MS) return fiatCache.rates;
  try {
    const r = await fetch(FIAT_URL, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    if (d?.result === 'success' && d.rates && typeof d.rates === 'object') {
      fiatCache = { at: now, rates: d.rates };
      return d.rates;
    }
    throw new Error('bad response');
  } catch {
    return fiatCache?.rates ?? {}; // last-good, else empty — client-side seed table covers the gap
  }
}

export async function GET() {
  const [prices, fiat] = await Promise.all([coinsUsd(Object.keys(TICKER)), fetchFiatRates()]);
  const rates: Record<string, number> = {};
  for (const [id, ticker] of Object.entries(TICKER)) {
    const v = prices[id] ?? 0;
    if (v > 0) rates[ticker] = v;
  }
  return NextResponse.json({ usd: rates, fiat });
}
