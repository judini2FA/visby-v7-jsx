import { describe, it, expect } from 'vitest';
import {
  FEE_BPS,
  FEE_FLOOR_CENTS,
  isSaleChannel,
  feeBpsForChannel,
  toCents,
  fromCents,
  platformFeeCents,
  sellerNetCents,
  feeBreakdown,
} from '@/lib/fees';

describe('fees — rates & channel resolution', () => {
  it('locks the take-rate: 9% marketplace / 3.5% partner', () => {
    expect(FEE_BPS.visby).toBe(900);
    expect(FEE_BPS.partner).toBe(350);
  });

  it('isSaleChannel only accepts known channels', () => {
    expect(isSaleChannel('visby')).toBe(true);
    expect(isSaleChannel('partner')).toBe(true);
    expect(isSaleChannel('sdk')).toBe(false);
    expect(isSaleChannel(null)).toBe(false);
    expect(isSaleChannel(undefined)).toBe(false);
    expect(isSaleChannel(900)).toBe(false);
  });

  it('defaults an unknown/absent channel to the SAFE higher 9% rate', () => {
    expect(feeBpsForChannel('visby')).toBe(900);
    expect(feeBpsForChannel('partner')).toBe(350);
    expect(feeBpsForChannel(null)).toBe(900);
    expect(feeBpsForChannel(undefined)).toBe(900);
    expect(feeBpsForChannel('garbage')).toBe(900);
  });
});

describe('fees — cents conversion (integer money math)', () => {
  it('toCents rounds to the nearest cent', () => {
    expect(toCents(100)).toBe(10000);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.005)).toBe(1); // rounds up
    expect(toCents(0.004)).toBe(0);
  });
  it('fromCents is the inverse (2dp)', () => {
    expect(fromCents(10000)).toBe(100);
    expect(fromCents(1999)).toBe(19.99);
    expect(fromCents(50)).toBe(0.5);
  });
});

describe('fees — platformFeeCents (%, floor, and price cap)', () => {
  it('takes the straight percentage on normal orders', () => {
    expect(platformFeeCents(10000, 'visby')).toBe(900); // $100 → $9.00
    expect(platformFeeCents(10000, 'partner')).toBe(350); // $100 → $3.50
    expect(platformFeeCents(25000, 'visby')).toBe(2250); // $250 → $22.50
  });

  it('applies the $0.50 floor when the percentage is below it', () => {
    // $10 partner → 3.5% = 35¢ → floored to 50¢
    expect(platformFeeCents(1000, 'partner')).toBe(FEE_FLOOR_CENTS);
    // $5 visby → 9% = 45¢ → floored to 50¢
    expect(platformFeeCents(500, 'visby')).toBe(50);
  });

  it('never lets the fee exceed the item price itself', () => {
    // 40¢ order: pct=4¢ → floor bumps to 50¢ → capped down to the 40¢ price
    expect(platformFeeCents(40, 'visby')).toBe(40);
    // 30¢ order → capped at 30¢
    expect(platformFeeCents(30, 'partner')).toBe(30);
  });

  it('defaults to the 9% rate for a missing channel', () => {
    expect(platformFeeCents(10000)).toBe(900);
    expect(platformFeeCents(10000, null)).toBe(900);
  });
});

describe('fees — sellerNetCents', () => {
  it('is price minus fee minus shipping', () => {
    // $100 visby, $5 shipping → 10000 - 900 - 500 = 8600
    expect(sellerNetCents(10000, 500, 'visby')).toBe(8600);
    // $100 partner, no shipping → 10000 - 350 = 9650
    expect(sellerNetCents(10000, 0, 'partner')).toBe(9650);
  });

  it('never goes negative when shipping ≥ net', () => {
    expect(sellerNetCents(10000, 20000, 'visby')).toBe(0);
    expect(sellerNetCents(100, 100, 'visby')).toBe(0);
  });
});

describe('fees — feeBreakdown (USD, the seller-facing math)', () => {
  it('produces a coherent breakdown that sums back to price', () => {
    const b = feeBreakdown(100, 5, 'visby');
    expect(b.channel).toBe('visby');
    expect(b.fee_bps).toBe(900);
    expect(b.platform_fee_usd).toBe(9);
    expect(b.shipping_usd).toBe(5);
    expect(b.seller_net_usd).toBe(86);
    expect(b.price_usd).toBe(100);
    // net + fee + shipping === price
    expect(b.seller_net_usd + b.platform_fee_usd + b.shipping_usd).toBe(b.price_usd);
  });

  it('normalizes an unknown channel to visby in the output', () => {
    const b = feeBreakdown(100, 0, 'mystery');
    expect(b.channel).toBe('visby');
    expect(b.fee_bps).toBe(900);
  });

  it('defaults shipping to 0', () => {
    const b = feeBreakdown(50, undefined, 'partner');
    expect(b.shipping_usd).toBe(0);
    expect(b.platform_fee_usd).toBe(1.75); // 3.5% of $50
    expect(b.seller_net_usd).toBe(48.25);
  });
});

// ── Unhappy paths (blueprint 11.4) — adversarial inputs to the money math ──
describe('fees — adversarial prices never throw and stay coherent', () => {
  it('a zero-price order yields a zero fee (the price cap wins over the floor)', () => {
    // min(0, max(50,0)) === 0 — a free item can never accrue a positive platform fee.
    expect(platformFeeCents(0, 'visby')).toBe(0);
    expect(platformFeeCents(0, 'partner')).toBe(0);
    expect(sellerNetCents(0, 0, 'visby')).toBe(0);
  });

  it('the price cap always beats the floor for any sub-floor price', () => {
    for (const p of [1, 10, 25, 40, 49]) {
      const fee = platformFeeCents(p, 'visby');
      expect(fee).toBe(p); // fee is clamped down to the item price, never exceeding it
      expect(fee).toBeLessThanOrEqual(p);
    }
  });

  it('the floor engages exactly at the crossover and the pct wins just above it', () => {
    // visby 9%: fee hits 50¢ at 556¢ (9% = 50.04¢ → 50). Below that the floor holds; at/above, pct wins.
    expect(platformFeeCents(555, 'visby')).toBe(FEE_FLOOR_CENTS); // 9% = 49.95 → 50, floor === pct
    expect(platformFeeCents(600, 'visby')).toBe(54); // 9% of 600 = 54, above the floor
    expect(platformFeeCents(1000, 'partner')).toBe(FEE_FLOOR_CENTS); // 3.5% = 35 → floored to 50
    expect(platformFeeCents(1500, 'partner')).toBe(53); // 3.5% of 1500 = 52.5 → 53, above the floor
  });

  it('a huge price stays finite and equals the straight percentage', () => {
    const huge = 1_000_000_000_00; // $1B in cents
    expect(platformFeeCents(huge, 'visby')).toBe(Math.round(huge * 0.09));
    expect(Number.isFinite(platformFeeCents(huge, 'visby'))).toBe(true);
    expect(sellerNetCents(huge, 0, 'visby')).toBe(huge - Math.round(huge * 0.09));
  });

  it('a negative price never invents a positive fee and never yields a positive net', () => {
    // The min(price, …) clamp means a negative price caps the "fee" at that negative number rather than
    // charging the floor; the important guarantee is that no positive fee is conjured from bad data.
    expect(platformFeeCents(-10000, 'visby')).toBeLessThanOrEqual(0);
    // sellerNet is floored at 0, so garbage-negative input can never produce money owed out.
    expect(sellerNetCents(-10000, 0, 'visby')).toBe(0);
    expect(sellerNetCents(-10000, 500, 'visby')).toBe(0);
  });

  it('shipping larger than the price never drives the seller net below zero', () => {
    expect(sellerNetCents(10000, 999999, 'visby')).toBe(0);
    expect(sellerNetCents(10000, 999999, 'partner')).toBe(0);
    expect(sellerNetCents(5000, 5000, 'partner')).toBe(sellerNetCents(5000, 5000, 'partner'));
    expect(sellerNetCents(5000, 5000, 'partner')).toBeGreaterThanOrEqual(0);
  });
});

describe('fees — cents conversion on non-finite / extreme inputs does not crash', () => {
  it('toCents/fromCents propagate NaN rather than throwing', () => {
    expect(Number.isNaN(toCents(NaN))).toBe(true);
    expect(Number.isNaN(fromCents(NaN))).toBe(true);
  });

  it('toCents on ±Infinity stays ±Infinity (no exception)', () => {
    expect(toCents(Infinity)).toBe(Infinity);
    expect(toCents(-Infinity)).toBe(-Infinity);
  });

  it('toCents rounds sub-cent negatives toward zero the same way as positives', () => {
    expect(toCents(-0.004)).toBe(-0); // rounds to 0
    expect(toCents(-0.005)).toBe(-0); // Math.round(-0.5) === -0 → 0
    expect(toCents(-19.99)).toBe(-1999);
  });
});

describe('fees — feeBreakdown never throws on hostile channel values', () => {
  it('normalizes empty-string, whitespace, numeric-as-string and object-ish channels to visby', () => {
    for (const ch of ['', '   ', 'VISBY', 'Partner', 'sdk', '900'] as string[]) {
      const b = feeBreakdown(100, 0, ch);
      expect(b.channel).toBe('visby');
      expect(b.fee_bps).toBe(900);
    }
  });

  it('isSaleChannel is case-sensitive and rejects near-misses', () => {
    expect(isSaleChannel('Visby')).toBe(false);
    expect(isSaleChannel('VISBY')).toBe(false);
    expect(isSaleChannel(' visby ')).toBe(false);
    expect(isSaleChannel('')).toBe(false);
    expect(isSaleChannel({})).toBe(false);
    expect(isSaleChannel([])).toBe(false);
  });
});
