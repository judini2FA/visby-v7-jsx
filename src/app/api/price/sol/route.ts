export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { solUsd } from '@/lib/price-oracle';

// SOL spot price in USD, for converting a fiat amount the user types into the SOL the send actually moves.
// Served from the shared oracle (keyed CoinGecko → Jupiter → Binance, ~60s cache, last-good fallback);
// fail-soft ({ usd: null }) so the Pay UI degrades to entering SOL directly rather than breaking.
export async function GET() {
  const usd = await solUsd();
  return NextResponse.json({ usd: usd > 0 ? usd : null });
}
