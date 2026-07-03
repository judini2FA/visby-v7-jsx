// Pure, side-effect-free fee/payout reconciliation for an order row (blueprint 4.8).
//
// Re-derives the expected fee breakdown from src/lib/fees.ts (the single source of truth for the
// take-rate) and compares it to what's actually stored on the order. Detect-only: this file never
// writes to the DB — the cron route that calls it is read-only too. A 1-cent tolerance absorbs
// float/rounding drift that isn't a real bug (feeBreakdown already rounds to whole cents, but the
// stored values may have been computed by an older code path or hand-rounded upstream).

import { feeBreakdown } from './fees';

export const RECONCILE_TOLERANCE_USD = 0.01;

export type ReconcilableOrder = {
  id: string;
  price_usdc: number | null;
  sale_channel: string | null;
  platform_fee_usd: number | null;
  seller_net_usd: number | null;
  payout_released: boolean | null;
  payout_tx: string | null;
  status: string | null;
};

export type ReconcileResult = {
  ok: boolean;
  expected: { platform_fee_usd: number; seller_net_usd: number } | null;
  drift: string[];
};

function centsDiff(a: number, b: number): number {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100));
}

// Re-derives expected fee/net from price_usdc + sale_channel and compares to the stored values,
// plus a couple of cheap consistency sanity checks that don't depend on re-deriving anything.
// Never throws — a malformed/partial order row is reported as drift, not an exception, since the
// cron scans many rows and one bad row must not abort the sweep.
export function reconcileOrder(order: ReconcilableOrder): ReconcileResult {
  const drift: string[] = [];

  const price = typeof order.price_usdc === 'number' ? order.price_usdc : null;
  let expected: { platform_fee_usd: number; seller_net_usd: number } | null = null;

  if (price === null || !Number.isFinite(price)) {
    drift.push('missing_or_invalid_price_usdc');
  } else {
    const breakdown = feeBreakdown(price, 0, order.sale_channel);
    expected = {
      platform_fee_usd: breakdown.platform_fee_usd,
      seller_net_usd: breakdown.seller_net_usd,
    };

    if (typeof order.platform_fee_usd !== 'number') {
      drift.push('platform_fee_usd_missing');
    } else if (centsDiff(order.platform_fee_usd, expected.platform_fee_usd) > RECONCILE_TOLERANCE_USD * 100) {
      drift.push(
        `platform_fee_usd_mismatch: stored=${order.platform_fee_usd} expected=${expected.platform_fee_usd}`,
      );
    }

    if (typeof order.seller_net_usd !== 'number') {
      drift.push('seller_net_usd_missing');
    } else if (centsDiff(order.seller_net_usd, expected.seller_net_usd) > RECONCILE_TOLERANCE_USD * 100) {
      drift.push(
        `seller_net_usd_mismatch: stored=${order.seller_net_usd} expected=${expected.seller_net_usd}`,
      );
    }
  }

  // Payout consistency: a released payout must carry a tx reference.
  if (order.payout_released === true && !order.payout_tx) {
    drift.push('payout_released_without_payout_tx');
  }

  // A delivered order should have completed fee accounting.
  if (order.status === 'delivered' && (order.platform_fee_usd == null || order.seller_net_usd == null)) {
    drift.push('delivered_order_missing_fee_fields');
  }

  return { ok: drift.length === 0, expected, drift };
}
