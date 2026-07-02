import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

// Platform KPIs for the admin home. Any admin role may read it. Aggregates orders in JS (fine at
// current scale) and fail-softs every count so a missing/unmigrated table shows 0 rather than 500ing.
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

  const safeCount = async (build: () => any): Promise<number> => {
    try { const { count, error } = await build(); return error ? 0 : (count ?? 0); } catch { return 0; }
  };

  let orders: any[] = [];
  try {
    const { data } = await supabase
      .from('orders')
      .select('id, item_id, buyer_wallet, seller_wallet, price_usdc, platform_fee_usd, seller_net_usd, status, payout_released, pay_method, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);
    orders = data ?? [];
  } catch { orders = []; }

  const byStatus: Record<string, number> = {};
  let gmv = 0, fees = 0, pendingPayoutCount = 0, pendingPayoutUsd = 0;
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    gmv += num(o.price_usdc);
    fees += num(o.platform_fee_usd);
    if (o.status === 'delivered' && !o.payout_released) { pendingPayoutCount++; pendingPayoutUsd += num(o.seller_net_usd); }
  }

  const [activeListings, totalUsers, openDisputes, pendingKyc, openReports] = await Promise.all([
    safeCount(() => supabase.from('items').select('id', { count: 'exact', head: true }).eq('is_listed', true)),
    safeCount(() => supabase.from('profiles').select('wallet', { count: 'exact', head: true })),
    safeCount(() => supabase.from('disputes').select('id', { count: 'exact', head: true }).in('status', ['open', 'under_review'])),
    safeCount(() => supabase.from('profiles').select('wallet', { count: 'exact', head: true }).eq('kyc_status', 'pending')),
    safeCount(() => supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open')),
  ]);

  const recent = orders.slice(0, 8).map((o) => ({
    id: o.id, item_id: o.item_id, buyer_wallet: o.buyer_wallet, seller_wallet: o.seller_wallet,
    price_usdc: num(o.price_usdc), status: o.status, pay_method: o.pay_method, created_at: o.created_at,
  }));

  return NextResponse.json({
    orders: { total: orders.length, byStatus, gmv, fees },
    payouts: { pendingCount: pendingPayoutCount, pendingUsd: pendingPayoutUsd },
    activeListings, totalUsers,
    moderation: { openDisputes, pendingKyc, openReports },
    recent,
  });
}
