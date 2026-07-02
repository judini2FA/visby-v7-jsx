import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

// Read-only order feed for the admin console. Any admin role may read it. No mutations here —
// settlement/payout writes live in the money-path routes and are out of scope for this view.
// Every query fail-softs so a missing/unmigrated table or column returns an empty list, never a 500.
async function requireAdmin(req: Request, wallet: string | null): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet))) return false;
  return callerOwnsWallet(req, wallet);
}

const STATUSES = ['paid', 'shipped', 'delivered', 'cancelled', 'refunded'] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get('wallet');
  if (!(await requireAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = url.searchParams.get('status');
  const q = (url.searchParams.get('q') ?? '').trim();
  const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);

  const supabase = createServiceClient();

  let orders: any[] = [];
  try {
    let query = supabase
      .from('orders')
      .select('id, item_id, buyer_wallet, seller_wallet, price_usdc, pay_method, status, tracking_carrier, tracking_number, payout_released, platform_fee_usd, seller_net_usd, created_at, shipped_at, delivered_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (status && (STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status);
    }
    if (q) {
      const term = q.replace(/[%,()]/g, '');
      // item_id is a uuid column — ilike on it errors, so only add an exact item_id match when the
      // query is a full uuid; the wallet columns are text and take a substring ilike.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term);
      const clauses = [`buyer_wallet.ilike.%${term}%`, `seller_wallet.ilike.%${term}%`];
      if (isUuid) clauses.push(`item_id.eq.${term}`);
      query = query.or(clauses.join(','));
    }

    const { data, error } = await query;
    orders = error ? [] : (data ?? []);
  } catch {
    orders = [];
  }

  const rows = orders.map((o) => ({
    id: o.id,
    item_id: o.item_id,
    buyer_wallet: o.buyer_wallet,
    seller_wallet: o.seller_wallet,
    price_usdc: num(o.price_usdc),
    pay_method: o.pay_method,
    status: o.status,
    tracking_carrier: o.tracking_carrier ?? null,
    tracking_number: o.tracking_number ?? null,
    payout_released: !!o.payout_released,
    platform_fee_usd: num(o.platform_fee_usd),
    seller_net_usd: num(o.seller_net_usd),
    created_at: o.created_at,
    shipped_at: o.shipped_at ?? null,
    delivered_at: o.delivered_at ?? null,
  }));

  return NextResponse.json({ orders: rows });
}
