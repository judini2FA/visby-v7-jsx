import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

// Read-only finance aggregates for the admin console. Any admin role may read it. Aggregates orders in
// JS (fine at current scale) and fail-softs every query so a missing/unmigrated column shows 0 rather
// than 500ing.
async function requireAdmin(req: Request, wallet: string | null): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet))) return false;
  return callerOwnsWallet(req, wallet);
}

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!(await requireAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServiceClient();
  const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);

  let orders: any[] = [];
  try {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    orders = data ?? [];
  } catch { orders = []; }

  let gmv = 0, fees = 0;
  const feesByChannel = { visby: 0, sdk: 0 };
  const payoutsByMethod = { card: 0, crypto: 0 };
  let releasedUsd = 0, releasedCount = 0, pendingUsd = 0, pendingCount = 0;

  for (const o of orders) {
    const price = num(o.price_usdc);
    const fee = num(o.platform_fee_usd);
    const net = num(o.seller_net_usd);
    gmv += price;
    fees += fee;

    // sale_channel is 'visby' (on-platform) or the embedded/API channel. Bucket anything non-visby as sdk.
    if (o.sale_channel === 'visby') feesByChannel.visby += fee;
    else feesByChannel.sdk += fee;

    // payout_method is 'card' | 'crypto'.
    if (o.payout_method === 'crypto') payoutsByMethod.crypto += net;
    else if (o.payout_method === 'card') payoutsByMethod.card += net;

    if (o.payout_released) { releasedUsd += net; releasedCount++; }
    else if (o.status === 'delivered') { pendingUsd += net; pendingCount++; }
  }

  const recentPayouts = orders
    .filter((o) => o.payout_released)
    .slice(0, 12)
    .map((o) => ({
      id: o.id,
      seller_wallet: o.seller_wallet,
      seller_net_usd: num(o.seller_net_usd),
      payout_method: o.payout_method ?? null,
      payout_tx: o.payout_tx ?? null,
      sale_channel: o.sale_channel ?? null,
      delivered_at: o.delivered_at ?? o.created_at,
    }));

  return NextResponse.json({
    gmv,
    fees,
    ordersCount: orders.length,
    feesByChannel,
    payoutsByMethod,
    released: { usd: releasedUsd, count: releasedCount },
    pending: { usd: pendingUsd, count: pendingCount },
    recentPayouts,
  });
}
