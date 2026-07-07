import { describe, it, expect } from 'vitest';
import { reconcileOrder, RECONCILE_TOLERANCE_USD, type ReconcilableOrder } from '@/lib/reconcile';

// A well-formed, correctly-priced order (9% visby: $100 → $9 fee, $91 net).
const clean: ReconcilableOrder = {
  id: 'ord_1',
  price_usdc: 100,
  sale_channel: 'visby',
  platform_fee_usd: 9,
  seller_net_usd: 91,
  payout_released: false,
  payout_tx: null,
  status: 'paid',
};

describe('reconcileOrder — clean orders reconcile', () => {
  it('a correctly-priced visby order has no drift', () => {
    const r = reconcileOrder(clean);
    expect(r.ok).toBe(true);
    expect(r.drift).toEqual([]);
    expect(r.expected).toEqual({ platform_fee_usd: 9, seller_net_usd: 91 });
  });

  it('re-derives the partner (3.5%) rate from sale_channel', () => {
    const r = reconcileOrder({ ...clean, sale_channel: 'partner', platform_fee_usd: 3.5, seller_net_usd: 96.5 });
    expect(r.ok).toBe(true);
    expect(r.expected).toEqual({ platform_fee_usd: 3.5, seller_net_usd: 96.5 });
  });

  it('defaults an unknown channel to the 9% rate', () => {
    const r = reconcileOrder({ ...clean, sale_channel: 'mystery' });
    expect(r.expected).toEqual({ platform_fee_usd: 9, seller_net_usd: 91 });
    expect(r.ok).toBe(true);
  });
});

describe('reconcileOrder — fee/net drift detection', () => {
  it('flags an overcharged platform fee', () => {
    const r = reconcileOrder({ ...clean, platform_fee_usd: 12, seller_net_usd: 88 });
    expect(r.ok).toBe(false);
    expect(r.drift.some((d) => d.startsWith('platform_fee_usd_mismatch'))).toBe(true);
    expect(r.drift.some((d) => d.startsWith('seller_net_usd_mismatch'))).toBe(true);
  });

  it('absorbs a 1-cent rounding drift (within tolerance)', () => {
    const r = reconcileOrder({ ...clean, platform_fee_usd: 9 + RECONCILE_TOLERANCE_USD, seller_net_usd: 91 });
    expect(r.ok).toBe(true);
  });

  it('flags a 2-cent drift (beyond tolerance)', () => {
    const r = reconcileOrder({ ...clean, platform_fee_usd: 9.02 });
    expect(r.ok).toBe(false);
    expect(r.drift.some((d) => d.startsWith('platform_fee_usd_mismatch'))).toBe(true);
  });
});

describe('reconcileOrder — malformed rows are reported, never thrown', () => {
  it('flags a missing/invalid price', () => {
    expect(reconcileOrder({ ...clean, price_usdc: null }).drift).toContain('missing_or_invalid_price_usdc');
    expect(reconcileOrder({ ...clean, price_usdc: NaN }).drift).toContain('missing_or_invalid_price_usdc');
  });

  it('flags missing fee fields', () => {
    const r = reconcileOrder({ ...clean, platform_fee_usd: null, seller_net_usd: null });
    expect(r.drift).toContain('platform_fee_usd_missing');
    expect(r.drift).toContain('seller_net_usd_missing');
  });
});

describe('reconcileOrder — payout/status consistency', () => {
  it('flags a released payout with no tx reference', () => {
    const r = reconcileOrder({ ...clean, payout_released: true, payout_tx: null });
    expect(r.drift).toContain('payout_released_without_payout_tx');
  });

  it('accepts a released payout that carries a tx', () => {
    const r = reconcileOrder({ ...clean, payout_released: true, payout_tx: 'sig_abc' });
    expect(r.drift).not.toContain('payout_released_without_payout_tx');
  });

  it('flags a delivered order missing fee accounting', () => {
    const r = reconcileOrder({ ...clean, status: 'delivered', platform_fee_usd: null, seller_net_usd: null });
    expect(r.drift).toContain('delivered_order_missing_fee_fields');
  });
});
