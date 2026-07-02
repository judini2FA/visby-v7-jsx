// Shared CoinGecko price oracle for the quote/display paths that were each re-fetching the same rates
// uncached (on-ramp + Li.Fi quotes). A short in-process cache cuts CoinGecko quota and keeps a single
// quote render internally consistent; on a fetch error it falls back to the last good value so a quote
// never blanks. Server-only.
//
// DELIBERATELY NOT used by the fund-moving paths (on-ramp fulfill/charge-saved disbursement, sol-pay +
// sdk-settle slippage checks, payout/refund FX): those must price against a FRESH oracle every time, so
// they keep their own no-cache fetch. Callers here that ever need a fresh read pass { fresh: true }.

const CG = 'https://api.coingecko.com/api/v3/simple/price';
const TTL_MS = 60_000;

type Entry = { at: number; usd: Record<string, number> };
const cache = new Map<string, Entry>(); // key = sorted CoinGecko id list

async function fetchCg(ids: string[], timeoutMs: number): Promise<Record<string, number>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${CG}?ids=${ids.join(',')}&vs_currencies=usd`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    const d = await r.json();
    const out: Record<string, number> = {};
    for (const id of ids) out[id] = d?.[id]?.usd ?? 0;
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

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
  try {
    const usd = await fetchCg(ids, opts.timeoutMs ?? 5000);
    // Only cache a fully-populated result so a transient partial/zero response doesn't poison the window.
    if (ids.every((id) => (usd[id] ?? 0) > 0)) cache.set(key, { at: now, usd });
    return usd;
  } catch {
    // Network/abort: a fresh caller must never get stale data (return zeros so its guard trips); a
    // display caller prefers the last good value over a blank quote.
    if (!opts.fresh) {
      const hit = cache.get(key);
      if (hit) return hit.usd;
    }
    return Object.fromEntries(ids.map((id) => [id, 0]));
  }
}

export async function solUsd(opts: { fresh?: boolean; timeoutMs?: number } = {}): Promise<number> {
  const r = await coinsUsd(['solana'], opts);
  return r.solana ?? 0;
}
