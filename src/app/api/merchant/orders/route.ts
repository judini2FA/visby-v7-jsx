import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code ?? '')) return true;
  return !!error.message?.includes('does not exist');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type StatusCounts = { paid: number; minted: number; failed: number; pending: number; cancelled: number };

const EMPTY_STATUS_COUNTS: StatusCounts = { paid: 0, minted: 0, failed: 0, pending: 0, cancelled: 0 };
const EMPTY_SUMMARY = {
  gross_usd: 0,
  platform_fee_usd: 0,
  merchant_net_usd: 0,
  count: 0,
  by_status: EMPTY_STATUS_COUNTS,
};

// Blueprint 5.1 + 5.3 — merchant-facing orders list + revenue/fee breakdown. Ownership is enforced
// exactly like the other merchant routes: a valid Privy token controlling owner_wallet, and the
// merchant row is re-verified (id + owner_wallet) before any orders are exposed.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const owner_wallet = searchParams.get('owner_wallet');
    const merchant_id = searchParams.get('merchant_id');

    if (!owner_wallet) return NextResponse.json({ error: 'Missing owner_wallet' }, { status: 400 });
    if (!merchant_id) return NextResponse.json({ error: 'Missing merchant_id' }, { status: 400 });
    if (!(await callerOwnsWallet(req, owner_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Confirm the merchant belongs to the caller before exposing its orders.
    const { data: merchant, error: merchantErr } = await supabase
      .from('merchants').select('id').eq('id', merchant_id).eq('owner_wallet', owner_wallet).maybeSingle();
    if (merchantErr) {
      if (isMissingSchema(merchantErr)) return NextResponse.json({ orders: [], summary: EMPTY_SUMMARY });
      return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
    }
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const COLUMNS =
      'id, product_name, price_usdc, currency, status, buyer_wallet, pay_method, fee_bps, platform_fee_usd, merchant_net_usd, created_at, paid_at, minted_at, webhook_delivered, webhook_last_error, nft_mint_address, serial_number';

    const { data: orders, error: ordersErr } = await supabase
      .from('sdk_orders')
      .select(COLUMNS)
      .eq('merchant_id', merchant_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (ordersErr) {
      if (isMissingSchema(ordersErr)) return NextResponse.json({ orders: [], summary: EMPTY_SUMMARY });
      console.error('[merchant/orders] list error:', ordersErr);
      return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
    }

    // Revenue summary over ALL settled orders (paid or minted) — a second, lighter query so the
    // 50-row page above doesn't cap the totals.
    const { data: settled, error: settledErr } = await supabase
      .from('sdk_orders')
      .select('status, price_usdc, platform_fee_usd, merchant_net_usd')
      .eq('merchant_id', merchant_id)
      .in('status', ['paid', 'minted'])
      .limit(5000);
    if (settledErr && !isMissingSchema(settledErr)) {
      console.error('[merchant/orders] summary error:', settledErr);
      return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
    }

    // Lightweight status breakdown across ALL the merchant's orders (not just the 50-row page).
    const { data: statusRows, error: statusErr } = await supabase
      .from('sdk_orders')
      .select('status')
      .eq('merchant_id', merchant_id)
      .limit(5000);
    if (statusErr && !isMissingSchema(statusErr)) {
      console.error('[merchant/orders] status error:', statusErr);
      return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
    }

    const by_status: StatusCounts = { ...EMPTY_STATUS_COUNTS };
    for (const row of statusRows ?? []) {
      const s = row.status as keyof StatusCounts | undefined;
      if (s && s in by_status) by_status[s] += 1;
    }

    let gross = 0;
    let fee = 0;
    let net = 0;
    for (const row of settled ?? []) {
      gross += Number(row.price_usdc ?? 0);
      fee += Number(row.platform_fee_usd ?? 0);
      net += Number(row.merchant_net_usd ?? 0);
    }

    const summary = {
      gross_usd: round2(gross),
      platform_fee_usd: round2(fee),
      merchant_net_usd: round2(net),
      count: (settled ?? []).length,
      by_status,
    };

    return NextResponse.json({ orders: orders ?? [], summary });
  } catch (err) {
    console.error('[merchant/orders] GET error:', err);
    return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
  }
}
