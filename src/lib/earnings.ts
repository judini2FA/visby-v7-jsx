import { createServiceClient } from '@/lib/supabase/service';

// Blueprint 4.10 — seller earnings summary, the app-side companion to 1099-K reporting. The actual
// 1099-K FILING is Stripe-Connect-native (Express onboarding — built in 4.3 — collects the seller's tax
// info; Stripe generates + files the forms for connected accounts over the federal/state thresholds once
// Judah enables tax-form filing in the Connect dashboard). This helper gives sellers (and admins) a
// read-only view of their realized earnings so they can see what they've made and whether they're near a
// reporting threshold. Realized = payout actually released (payout_released), matching what a 1099 counts.
//
// CAVEAT (crypto payouts): sellers paid in SOL/USDC are NOT covered by Stripe's Connect 1099-K — issuing
// their forms is a separate, entity/EIN-gated compliance step for Visby. This view still counts their
// earnings so the number is complete; the FILING path for crypto payees is a Judah decision.

export type YearEarnings = { year: number; gross_usd: number; net_usd: number; orders: number };

export async function sellerEarnings(sellerWallet: string): Promise<{
  all_time_net_usd: number;
  by_year: YearEarnings[];
}> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('orders')
    .select('price_usdc, seller_net_usd, payout_released, created_at')
    .eq('seller_wallet', sellerWallet)
    .eq('payout_released', true);

  if (error || !data) return { all_time_net_usd: 0, by_year: [] };

  const byYear = new Map<number, YearEarnings>();
  let allNet = 0;
  for (const row of data) {
    const year = new Date(row.created_at as string).getUTCFullYear();
    const net = Number(row.seller_net_usd ?? 0);
    const gross = Number(row.price_usdc ?? 0);
    allNet += net;
    const y = byYear.get(year) ?? { year, gross_usd: 0, net_usd: 0, orders: 0 };
    y.gross_usd += gross;
    y.net_usd += net;
    y.orders += 1;
    byYear.set(year, y);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const by_year = [...byYear.values()]
    .map(y => ({ ...y, gross_usd: round2(y.gross_usd), net_usd: round2(y.net_usd) }))
    .sort((a, b) => b.year - a.year);

  return { all_time_net_usd: round2(allNet), by_year };
}
