import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// A supabase error means "missing schema" (migration pending) when the table, column, or
// function doesn't exist yet. Treat those as a SAFE DEFAULT — the metric is 0/empty, never a 500.
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (['42P01', 'PGRST205', '42703', 'PGRST202', '42883'].includes(error.code ?? '')) return true;
  return !!error.message?.includes('does not exist');
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Seller revenue + listing performance. Authed (revenue is sensitive). Every query is tolerant:
// a missing table/column degrades that metric to zero/empty rather than failing the whole route.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    const zero = {
      grossRevenue: 0,
      netEarnings: 0,
      platformFees: 0,
      itemsSold: 0,
      avgSalePrice: 0,
      pendingCount: 0,
      pendingGross: 0,
      refundedCount: 0,
      activeListings: 0,
      totalViews: 0,
      totalLikes: 0,
      perItem: [] as Array<Record<string, unknown>>,
    };

    // ── Orders (revenue) ──
    const { data: ordersData, error: ordersErr } = await supabase
      .from('orders')
      .select('*')
      .eq('seller_wallet', wallet);

    if (ordersErr && !isMissingSchema(ordersErr)) {
      console.error('[seller/analytics] orders error:', ordersErr);
    }
    const orders = ordersErr ? [] : (ordersData ?? []);

    const completed = orders.filter((o: any) => o.status === 'delivered');
    const grossRevenue = completed.reduce((a: number, o: any) => a + num(o.price_usdc), 0);
    const platformFees = completed.reduce(
      (a: number, o: any) => a + (o.platform_fee_usd == null ? 0 : num(o.platform_fee_usd)),
      0,
    );
    const netEarnings = orders
      .filter((o: any) => o.payout_released === true)
      .reduce((a: number, o: any) => a + num(o.seller_net_usd), 0);
    const itemsSold = completed.length;
    const avgSalePrice = itemsSold ? grossRevenue / itemsSold : 0;

    const pending = orders.filter((o: any) => o.status === 'paid' || o.status === 'shipped');
    const pendingCount = pending.length;
    const pendingGross = pending.reduce((a: number, o: any) => a + num(o.price_usdc), 0);
    const refundedCount = orders.filter((o: any) => o.status === 'refunded').length;

    // ── Items (listings + views) ──
    // select('*') (not an explicit column list) so a missing view_count column pre-migration doesn't
    // fail the whole query and wipe activeListings/perItem — view_count is read defensively as 0 below.
    const { data: itemsData, error: itemsErr } = await supabase
      .from('items')
      .select('*')
      .eq('current_owner_wallet', wallet);

    if (itemsErr && !isMissingSchema(itemsErr)) {
      console.error('[seller/analytics] items error:', itemsErr);
    }
    const items = itemsErr ? [] : (itemsData ?? []);

    const activeListings = items.filter((i: any) => i.is_listed === true).length;
    const totalViews = items.reduce((a: number, i: any) => a + num(i.view_count), 0);
    const itemIds = items.map((i: any) => i.id);

    // ── Likes (per-item + total) ──
    const likeMap: Record<string, number> = {};
    let totalLikes = 0;
    if (itemIds.length) {
      const { data: likesData, error: likesErr } = await supabase
        .from('likes')
        .select('item_id')
        .in('item_id', itemIds);
      if (likesErr && !isMissingSchema(likesErr)) {
        console.error('[seller/analytics] likes error:', likesErr);
      }
      for (const row of likesErr ? [] : (likesData ?? [])) {
        const id = (row as any).item_id as string;
        likeMap[id] = (likeMap[id] ?? 0) + 1;
      }
      totalLikes = (likesErr ? [] : (likesData ?? [])).length;
    }

    const perItem = items
      .map((i: any) => ({
        id: i.id,
        name: i.name,
        image_url: i.image_url ?? null,
        is_listed: i.is_listed === true,
        price_usdc: i.price_usdc ?? null,
        view_count: num(i.view_count),
        likes: likeMap[i.id] ?? 0,
      }))
      .sort((a, b) => b.view_count - a.view_count);

    return NextResponse.json({
      analytics: {
        ...zero,
        grossRevenue,
        netEarnings,
        platformFees,
        itemsSold,
        avgSalePrice,
        pendingCount,
        pendingGross,
        refundedCount,
        activeListings,
        totalViews,
        totalLikes,
        perItem,
      },
    });
  } catch (err) {
    console.error('[seller/analytics] error:', err);
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
