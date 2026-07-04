import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { redeliverSdkOrderNow } from '@/lib/sdk-webhook-redelivery';

export const dynamic = 'force-dynamic';

// Blueprint 5.2 — a merchant manually re-sends one order's webhook from the dashboard. Privy-authed and
// scoped to a single order the caller's merchant owns (the cron redeliver endpoint is CRON_SECRET-gated
// and batch-wide, so it can't be exposed to merchants). Re-fires the notification only — settlement is
// untouched.
export async function POST(req: Request) {
  try {
    const { owner_wallet, merchant_id, order_id } = await req.json();
    if (!owner_wallet || !merchant_id || !order_id) {
      return NextResponse.json({ error: 'Missing owner_wallet, merchant_id, or order_id' }, { status: 400 });
    }
    if (!(await callerOwnsWallet(req, owner_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`merchant-redeliver:${owner_wallet}`, { limit: 20, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();

    // The order must belong to a merchant owned by the caller — verified in ONE query so a caller can't
    // re-send another merchant's order by guessing an order_id.
    const { data: order } = await supabase
      .from('sdk_orders')
      .select('id, merchants!inner(id, owner_wallet)')
      .eq('id', order_id)
      .eq('merchant_id', merchant_id)
      .maybeSingle();
    const m = order ? (order as { merchants: { owner_wallet: string } | { owner_wallet: string }[] }).merchants : null;
    const ownerOk = m ? (Array.isArray(m) ? m[0]?.owner_wallet === owner_wallet : m.owner_wallet === owner_wallet) : false;
    if (!order || !ownerOk) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const res = await redeliverSdkOrderNow(order_id);
    if (!res.ok) return NextResponse.json({ error: res.error ?? 'Re-send failed' }, { status: res.status ?? 502 });

    return NextResponse.json({ ok: true, delivered: !!res.delivered });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Re-send failed' }, { status: 500 });
  }
}
