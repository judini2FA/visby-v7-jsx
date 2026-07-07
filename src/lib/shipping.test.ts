import { describe, it, expect } from 'vitest';
import { recommendRate, pickCheapest } from '@/lib/shipping';
import type { ShipRate } from '@/lib/shipping/types';

// Blueprint 11.4 — the pure rate-recommendation logic on empty / all-null / none-in-window inputs.
// recommendRate is pure (no env/network; the network rateShop wraps it). Contract: pick the cheapest
// service that commits to ≤ 2 delivery days; if none commits in-window, fall back to the overall
// cheapest; if there are no rates at all, return null. A null delivery_days is never treated as
// in-window.

const rate = (over: Partial<ShipRate> & { rate: number }): ShipRate => ({
  id: over.id ?? `r_${over.rate}`,
  carrier: over.carrier ?? 'USPS',
  service: over.service ?? 'svc',
  service_code: over.service_code ?? 'code',
  delivery_days: over.delivery_days ?? null,
  ...over,
});

describe('shipping — recommendRate', () => {
  it('returns null for an empty rate list', () => {
    expect(recommendRate([])).toBeNull();
  });

  it('picks the cheapest service that lands within 2 days', () => {
    const rec = recommendRate([
      rate({ rate: 30, delivery_days: 1 }),
      rate({ rate: 20, delivery_days: 2 }),
      rate({ rate: 5, delivery_days: 5 }), // cheapest overall but out of window
    ]);
    expect(rec?.rate).toBe(20);
  });

  it('falls back to the overall cheapest when nothing commits within 2 days', () => {
    const rec = recommendRate([
      rate({ rate: 20, delivery_days: 5 }),
      rate({ rate: 8, delivery_days: 9 }),
    ]);
    expect(rec?.rate).toBe(8);
  });

  it('never treats a null delivery_days as in-window; still recommends the cheapest of them', () => {
    const rec = recommendRate([
      rate({ rate: 20, delivery_days: null }),
      rate({ rate: 10, delivery_days: null }),
    ]);
    expect(rec?.rate).toBe(10); // fell through to overall-cheapest, not "in window"
  });

  it('treats an undefined delivery_days (missing key) as not-in-window', () => {
    const rec = recommendRate([
      { id: 'a', carrier: 'UPS', service: 's', service_code: 'c', rate: 20 } as ShipRate,
      { id: 'b', carrier: 'UPS', service: 's', service_code: 'c', rate: 10 } as ShipRate,
    ]);
    expect(rec?.rate).toBe(10);
  });

  it('a rate at exactly the 2-day boundary counts as in-window', () => {
    const rec = recommendRate([
      rate({ rate: 40, delivery_days: 2 }),
      rate({ rate: 12, delivery_days: 3 }), // out of window even though cheaper
    ]);
    expect(rec?.rate).toBe(40);
  });

  it('a zero-day (same-day) rate is in-window', () => {
    const rec = recommendRate([rate({ rate: 15, delivery_days: 0 })]);
    expect(rec?.rate).toBe(15);
  });
});

describe('shipping — pickCheapest back-compat alias', () => {
  it('ignores the legacy maxDays arg and delegates to recommendRate', () => {
    const rates = [rate({ rate: 30, delivery_days: 1 }), rate({ rate: 20, delivery_days: 2 })];
    expect(pickCheapest(rates, 99)?.rate).toBe(recommendRate(rates)?.rate);
    expect(pickCheapest([])).toBeNull();
  });
});
