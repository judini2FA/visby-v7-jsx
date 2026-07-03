export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { captureMessage } from '@/lib/monitoring';
import { reconcileOrder, type ReconcilableOrder } from '@/lib/reconcile';

// Cross-provider fee reconciliation sweep (blueprint 4.8). For every order touched in the lookback
// window, re-derives the expected platform_fee_usd/seller_net_usd from src/lib/fees.ts (the single
// source of truth for the take-rate) and diffs it against what's actually stored, plus a couple of
// cheap payout-consistency sanity checks. ADDITIVE / READ-ONLY: this route only detects and alerts —
// it never writes to `orders` or moves money. Same CRON_SECRET timing-safe auth pattern (fail-closed
// on an unset secret) as reconcile-settlements.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers.get('x-cron-secret') ?? '');
  if (!provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const LOOKBACK_DAYS = 7;
const SCAN_LIMIT = 500;

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let orders: ReconcilableOrder[] = [];
  try {
    const { data } = await supabase
      .from('orders')
      .select('id, price_usdc, sale_channel, platform_fee_usd, seller_net_usd, payout_released, payout_tx, status')
      .gte('created_at', since)
      .limit(SCAN_LIMIT);
    orders = (data ?? []) as ReconcilableOrder[];
  } catch {
    // Table/column absent pre-migration — nothing to scan, report a clean no-op rather than throwing.
    return NextResponse.json({ ok: true, scanned: 0, drift: [] });
  }

  const driftRows: Array<{ id: string; drift: string[] }> = [];
  for (const order of orders) {
    const result = reconcileOrder(order);
    if (!result.ok) driftRows.push({ id: order.id, drift: result.drift });
  }

  if (driftRows.length) {
    captureMessage('error', '[reconcile-fees] fee/payout drift detected', {
      count: driftRows.length,
      scanned: orders.length,
      // Compact summary only — order id + which checks failed, never price/PII payloads.
      sample: driftRows.slice(0, 20).map((r) => ({ id: r.id, drift: r.drift })),
    });
  }

  return NextResponse.json({
    ok: true,
    scanned: orders.length,
    drift: driftRows.slice(0, 50),
  });
}

export { handle as GET, handle as POST };
