import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

// Public analytics for the burner demo storefront (/sdk/demo). Safe to expose without auth because it
// only ever reads the ONE fixed "Visby Demo Shop" merchant's fake test orders — never a real merchant.
// The real merchant dashboard (/merchant, /api/merchant/orders) stays ownership-gated. Everything the
// test harness shows — sales, payouts, conversions, who paid with what, mint + serial provenance —
// comes straight from sdk_orders so it reflects the true money/mint path, not a mock.

const DEMO_SLUG = 'visby-demo-shop';

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export async function GET() {
  const supabase = createServiceClient();

  const { data: merchant, error: mErr } = await supabase
    .from('merchants').select('id,name,merchant_wallet,fee_bps').eq('slug', DEMO_SLUG).maybeSingle();
  if (mErr) return NextResponse.json({ error: 'Analytics unavailable' }, { status: 503 });
  if (!merchant) return NextResponse.json({ merchant: null, orders: [], funnel: null, revenue: null, payouts: null, pay_methods: null });

  const { data: rows, error } = await supabase
    .from('sdk_orders')
    .select('id,product_name,serial_number,price_usdc,currency,platform_fee_usd,merchant_net_usd,status,pay_method,buyer_wallet,nft_mint_address,sol_signature,stripe_payment_intent,moov_transfer_id,merchant_payout_status,merchant_payout_tx,merchant_payout_at,created_at,paid_at,minted_at')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: 'Analytics unavailable' }, { status: 503 });

  const orders = rows ?? [];

  // Funnel: a payment counts once paid_at is set (a mint can still fail AFTER a successful payment, so
  // 'failed' is a paid order with no NFT — not a lost sale).
  const created = orders.length;
  const paid = orders.filter(o => o.paid_at).length;
  const minted = orders.filter(o => o.status === 'minted').length;
  const failed = orders.filter(o => o.status === 'failed').length;

  // Revenue over settled orders (paid or minted). merchant_net is what the store is owed.
  const settled = orders.filter(o => o.status === 'paid' || o.status === 'minted');
  const revenue = {
    gross_usd: settled.reduce((s, o) => s + num(o.price_usdc), 0),
    platform_fee_usd: settled.reduce((s, o) => s + num(o.platform_fee_usd), 0),
    merchant_net_usd: settled.reduce((s, o) => s + num(o.merchant_net_usd), 0),
    count: settled.length,
  };

  // Actual USDC payouts to the merchant wallet (Blueprint 5.6 cron sweep).
  const payoutBy: Record<string, number> = {};
  for (const o of orders) { const k = o.merchant_payout_status || 'none'; payoutBy[k] = (payoutBy[k] || 0) + 1; }
  const paidOut = orders.filter(o => o.merchant_payout_status === 'paid');
  const owed = orders.filter(o => (o.status === 'minted') && o.merchant_payout_status !== 'paid');
  const payouts = {
    paid_count: paidOut.length,
    paid_usd: paidOut.reduce((s, o) => s + num(o.merchant_net_usd), 0),
    owed_count: owed.length,
    owed_usd: owed.reduce((s, o) => s + num(o.merchant_net_usd), 0),
    by_status: payoutBy,
  };

  const pay_methods: Record<string, number> = {};
  for (const o of settled) { const k = o.pay_method || 'card'; pay_methods[k] = (pay_methods[k] || 0) + 1; }

  return NextResponse.json({
    merchant: { name: merchant.name, merchant_wallet: merchant.merchant_wallet, fee_bps: merchant.fee_bps },
    funnel: { created, paid, minted, failed },
    revenue,
    payouts,
    pay_methods,
    orders: orders.slice(0, 100),
  });
}
