import { describe, it, expect } from 'vitest';
import { localShipEstimate } from '@/lib/shipping-estimate';

// Blueprint 11.4 — the client-safe weight-based shipping ballpark on missing / garbage / extreme weights.
// Pure function, no env or network. Contract: returns 0 when there is no usable weight, clamps weight up
// to 1oz and the total down to $80, rounds to cents, and never throws.

describe('shipping-estimate — no usable weight returns 0', () => {
  it('returns 0 for null / undefined / zero / negative weight', () => {
    expect(localShipEstimate(null)).toBe(0);
    expect(localShipEstimate(undefined)).toBe(0);
    expect(localShipEstimate(0)).toBe(0);
    expect(localShipEstimate(-5)).toBe(0);
    expect(localShipEstimate(-0.001)).toBe(0);
  });

  it('returns 0 for a non-numeric weight (Number(x) → NaN) rather than NaN or a throw', () => {
    // @ts-expect-error — deliberately hostile input
    expect(localShipEstimate('abc')).toBe(0);
    // @ts-expect-error
    expect(localShipEstimate({})).toBe(0);
    expect(localShipEstimate(NaN)).toBe(0);
  });
});

describe('shipping-estimate — weight clamped up to 1oz, total clamped down to $80', () => {
  it('a sub-1oz weight is treated as 1oz (2day default: 9 + 0.35)', () => {
    expect(localShipEstimate(0.5)).toBe(9.35);
    expect(localShipEstimate(0.01)).toBe(9.35);
  });

  it('the total can never exceed $80 no matter how heavy', () => {
    expect(localShipEstimate(100_000)).toBe(80);
    expect(localShipEstimate(1e9, 'overnight')).toBe(80);
    expect(localShipEstimate(Infinity)).toBe(80);
  });

  it('the result is always rounded to whole cents', () => {
    const v = localShipEstimate(16, '2day'); // 9 + 0.35*16 = 14.6
    expect(v).toBe(14.6);
    expect(Number.isInteger(Math.round(v * 100))).toBe(true);
  });
});

describe('shipping-estimate — service tiers', () => {
  it('economy / cheapest use the cheap curve (6 + 0.20w)', () => {
    expect(localShipEstimate(10, 'economy')).toBe(8); // 6 + 2
    expect(localShipEstimate(10, 'cheapest')).toBe(8);
  });

  it('overnight uses the premium curve (25 + 0.80w)', () => {
    expect(localShipEstimate(10, 'overnight')).toBe(33); // 25 + 8
  });

  it('an unknown / empty / null service falls back to the 2day curve (9 + 0.35w)', () => {
    expect(localShipEstimate(10, 'teleport')).toBe(12.5); // 9 + 3.5
    expect(localShipEstimate(10, '')).toBe(12.5);
    expect(localShipEstimate(10, null)).toBe(12.5);
    expect(localShipEstimate(10, undefined)).toBe(12.5);
    expect(localShipEstimate(10)).toBe(12.5);
  });

  it('is always non-negative and finite for any usable weight', () => {
    for (const w of [1, 5, 50, 500, 5000]) {
      for (const s of ['economy', 'overnight', '2day', 'unknown']) {
        const v = localShipEstimate(w, s);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeLessThanOrEqual(80);
      }
    }
  });
});
