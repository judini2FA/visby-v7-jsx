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
