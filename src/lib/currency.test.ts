import { describe, it, expect } from 'vitest';
import {
  isCrypto,
  formatCurrency,
  toUsdc,
  FIAT_CURRENCIES,
  CRYPTO_CURRENCIES,
  CURRENCIES,
} from '@/lib/currency';

// Blueprint 11.4 — the display/convert helpers. Only the FIAT branches are deterministic offline: the
// crypto branches depend on live rates fetched from /api/price/rates, which never resolve in the test
// (node, no network) — asserting them would be flaky, so they're covered only by their documented
// fallback-to-USD behavior, which IS deterministic (no rate loaded → 1:1 / USD render).

describe('currency — isCrypto classification', () => {
  it('is true for every crypto and false for every fiat', () => {
    for (const c of CRYPTO_CURRENCIES) expect(isCrypto(c)).toBe(true);
    for (const c of FIAT_CURRENCIES) expect(isCrypto(c)).toBe(false);
  });

  it('the currency sets are disjoint and the union is exhaustive', () => {
    const overlap = FIAT_CURRENCIES.filter((c) => (CRYPTO_CURRENCIES as readonly string[]).includes(c));
    expect(overlap).toEqual([]);
    expect(new Set(CURRENCIES).size).toBe(FIAT_CURRENCIES.length + CRYPTO_CURRENCIES.length);
  });
});

describe('currency — formatCurrency (fiat)', () => {
  it('formats USD with the $ symbol and 2 decimals', () => {
    expect(formatCurrency(100, 'USD')).toBe('$100.00');
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('applies the per-fiat static rate', () => {
    expect(formatCurrency(100, 'EUR')).toBe('€92.00'); // 100 * 0.92
    expect(formatCurrency(100, 'GBP')).toBe('£79.00'); // 100 * 0.79
  });

  it('renders JPY with no decimals and rounding', () => {
    expect(formatCurrency(100, 'JPY')).toBe('¥14,950'); // 100 * 149.5, whole yen
    expect(formatCurrency(1.005, 'JPY')).toBe('¥150'); // 1.005 * 149.5 = 150.25 → 150
  });

  it('does not throw on zero or negative amounts', () => {
    expect(() => formatCurrency(-50, 'USD')).not.toThrow();
    expect(formatCurrency(-50, 'USD')).toContain('50.00');
    expect(() => formatCurrency(0, 'JPY')).not.toThrow();
  });

  it('a crypto currency with no rate loaded falls back to a USD render (never blank/NaN)', () => {
    // In the test process no rates are ever fetched, so the crypto path takes its documented USD fallback.
    const out = formatCurrency(100, 'SOL');
    expect(out).toBe('$100.00');
    expect(out).not.toContain('NaN');
  });
});

describe('currency — toUsdc (fiat)', () => {
  it('inverts the fiat rate back to USDC', () => {
    expect(toUsdc(92, 'EUR')).toBeCloseTo(100, 6);
    expect(toUsdc(79, 'GBP')).toBeCloseTo(100, 6);
    expect(toUsdc(100, 'USD')).toBe(100);
  });

  it('round-trips formatCurrency amounts back through toUsdc within rounding', () => {
    for (const c of FIAT_CURRENCIES) {
      const back = toUsdc(100 * ({ USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, AUD: 1.53, CAD: 1.36 }[c]), c);
      expect(back).toBeCloseTo(100, 4);
    }
  });

  it('a crypto amount with no rate loaded is treated 1:1 (best-effort), never NaN', () => {
    const v = toUsdc(3, 'ETH');
    expect(v).toBe(3);
    expect(Number.isNaN(v)).toBe(false);
  });

  it('handles zero and negative amounts without throwing', () => {
    expect(toUsdc(0, 'EUR')).toBe(0);
    expect(toUsdc(-92, 'EUR')).toBeCloseTo(-100, 6);
  });
});
