// Shared price oracle. CoinGecko first (keyed via COINGECKO_API_KEY when set — higher rate limits),
// then Jupiter, then Binance as independent fallbacks, so one provider outage can't blank quotes or
// stall disbursements. A short in-process cache keeps display paths cheap and internally consistent.
//
// Fund-moving paths (on-ramp fulfill/charge-saved disbursement, sol-pay + sdk-settle slippage checks,
// payout/refund FX) must price against a FRESH read every time: pass { fresh: true }, which never serves
// the cache and returns 0 on total failure so the caller's guard trips instead of moving money on a
// stale rate.

const CG = 'https://api.coingecko.com/api/v3/simple/price';
const TTL_MS = 60_000;

// CoinGecko id → SPL mint, for the Jupiter fallback (Solana-ecosystem coins only — others stay CG-only).
const MINT_BY_ID: Record<string, string> = {
  solana: 'So11111111111111111111111111111111111111112',
  'usd-coin': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};
const BINANCE_BY_ID: Record<string, string> = { solana: 'SOLUSDT', ethereum: 'ETHUSDT', bitcoin: 'BTCUSDT' };

type Entry = { at: number; usd: Record<string, number> };
const cache = new Map<string, Entry>(); // key = sorted CoinGecko id list

function withTimeout(timeoutMs: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, done: () => clearTimeout(timeout) };
}

async function fetchCg(ids: string[], timeoutMs: number): Promise<Record<string, number>> {
  const t = withTimeout(timeoutMs);
  try {
    const key = process.env.COINGECKO_API_KEY;
    const r = await fetch(`${CG}?ids=${ids.join(',')}&vs_currencies=usd`, {
      signal: t.signal,
      cache: 'no-store',
      headers: key ? { 'x-cg-demo-api-key': key } : undefined,
    });
    const d = await r.json();
    const out: Record<string, number> = {};
    for (const id of ids) out[id] = d?.[id]?.usd ?? 0;
    return out;
  } finally {
    t.done();
  }
}

async function fetchJupiter(ids: string[], timeoutMs: number): Promise<Record<string, number>> {
  const mints = ids.map((id) => MINT_BY_ID[id]);
  if (mints.some((m) => !m)) throw new Error('unmapped id');
  const t = withTimeout(timeoutMs);
  try {
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`, {
      signal: t.signal,
      cache: 'no-store',
    });
    const d = await r.json();
    const out: Record<string, number> = {};
    ids.forEach((id, i) => { out[id] = Number(d?.[mints[i]]?.usdPrice ?? 0) || 0; });
    return out;
  } finally {
    t.done();
  }
}

async function fetchBinance(ids: string[], timeoutMs: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const symbol = BINANCE_BY_ID[id];
    // USDC has no USD spot pair worth trusting over its peg; everything unmapped fails this source.
    if (!symbol) {
      if (id === 'usd-coin') { out[id] = 1; continue; }
      throw new Error('unmapped id');
    }
    const t = withTimeout(timeoutMs);
    try {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, {
        signal: t.signal,
        cache: 'no-store',
      });
      const d = await r.json();
      out[id] = Number(d?.price ?? 0) || 0;
    } finally {
      t.done();
    }
  }
  return out;
}

const complete = (ids: string[], usd: Record<string, number>) => ids.every((id) => (usd[id] ?? 0) > 0);

export async function coinsUsd(
  ids: string[],
  opts: { fresh?: boolean; timeoutMs?: number } = {},
): Promise<Record<string, number>> {
  const key = [...ids].sort().join(',');
  const now = Date.now();
  if (!opts.fresh) {
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) return hit.usd;
  }

  const timeoutMs = opts.timeoutMs ?? 5000;
  let best: Record<string, number> | null = null;
  for (const source of [fetchCg, fetchJupiter, fetchBinance]) {
    try {
      const usd = await source(ids, timeoutMs);
      if (complete(ids, usd)) {
        cache.set(key, { at: now, usd });
        return usd;
      }
      const filled = (r: Record<string, number>) => ids.filter((id) => (r[id] ?? 0) > 0).length;
      if (!best || filled(usd) > filled(best)) best = usd;
    } catch { /* try the next source */ }
  }

  // No source was complete: a fresh caller must never get stale data (zeros for the missing ids trip its
  // guard); a display caller prefers the last good cached value, then the best partial, over a blank quote.
  if (!opts.fresh) {
    const hit = cache.get(key);
    if (hit) return hit.usd;
  }
  return best ?? Object.fromEntries(ids.map((id) => [id, 0]));
}

export async function solUsd(opts: { fresh?: boolean; timeoutMs?: number } = {}): Promise<number> {
  const r = await coinsUsd(['solana'], opts);
  return r.solana ?? 0;
}
