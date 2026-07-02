import { NextResponse } from 'next/server';
import { createClient, getQuote } from '@lifi/sdk';
import { createServiceClient } from '@/lib/supabase/service';
import { coinsUsd } from '@/lib/price-oracle';
import { getToken, tokenDisplay, type SwapRoute } from '@/lib/payable-tokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const lifi = createClient({ integrator: 'Visby' });

async function getUsd(cgId: string): Promise<number> {
  return (await coinsUsd([cgId]))[cgId] ?? 0;
}

// A Li.Fi quote request from a token's plain-data route (src/lib/payable-tokens.ts). Addresses are
// quote-only placeholders — nothing is signed here.
function buildLifiQuote(route: SwapRoute, fromAmount: string) {
  const q: Record<string, unknown> = {
    fromAddress: route.fromAddress,
    fromChain: route.fromChain, toChain: route.toChain,
    fromToken: route.fromToken, toToken: route.toToken,
    fromAmount,
  };
  if (route.toAddress) q.toAddress = route.toAddress;
  return q as any;
}

// Convert a token amount to its smallest unit as an integer string, without float overflow.
function toBaseUnits(amount: number, decimals: number): string {
  if (decimals < 6) return Math.round(amount * 10 ** decimals).toString();
  const micro = Math.round(amount * 1e6);            // 6 sig digits is plenty for a quote
  return (BigInt(micro) * BigInt(10) ** BigInt(decimals - 6)).toString();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const item_id = searchParams.get('item_id');
    const from    = (searchParams.get('from') ?? 'ETH').toUpperCase();
    if (!item_id) return NextResponse.json({ error: 'Missing item_id' }, { status: 400 });

    const tok = getToken(from);
    if (!tok || tok.kind !== 'swap' || !tok.route || !tok.cgId || tok.decimals == null) {
      return NextResponse.json({ error: `Unsupported currency: ${from}` }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: item } = await supabase.from('items').select('price_usdc').eq('id', item_id).single();
    if (!item?.price_usdc) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const targetUsd = item.price_usdc as number;
    const tokenUsd  = await getUsd(tok.cgId);
    if (tokenUsd <= 0) return NextResponse.json({ error: 'Price feed unavailable' }, { status: 503 });

    const fromAmount = targetUsd / tokenUsd;
    const fromBase   = toBaseUnits(fromAmount, tok.decimals);

    try {
      const quote = await getQuote(lifi, buildLifiQuote(tok.route, fromBase));
      const e = quote.estimate;
      const usdcOut = Number(e.toAmount) / 1e6;
      const gasUsd  = (e.gasCosts ?? []).reduce((s, g: any) => s + Number(g.amountUSD ?? 0), 0);

      return NextResponse.json({
        from: tok.label,
        source: 'lifi',
        tool: quote.toolDetails?.name ?? quote.tool,
        target_usd: targetUsd,
        from_amount: fromAmount,
        from_amount_display: tokenDisplay(from, fromAmount),
        usdc_out: usdcOut,
        usdc_out_display: `${usdcOut.toFixed(2)} USDC`,
        gas_usd: gasUsd,
        duration_s: e.executionDuration ?? 0,
        token_usd: tokenUsd,
      });
    } catch {
      return NextResponse.json({
        from: tok.label,
        source: 'estimate',
        tool: null,
        target_usd: targetUsd,
        from_amount: fromAmount,
        from_amount_display: tokenDisplay(from, fromAmount),
        usdc_out: targetUsd,
        usdc_out_display: `${targetUsd.toFixed(2)} USDC`,
        gas_usd: 0,
        duration_s: 0,
        token_usd: tokenUsd,
        note: 'Live Li.Fi route unavailable — showing CoinGecko estimate.',
      });
    }
  } catch (err) {
    console.error('[lifi/swap-quote]', err);
    return NextResponse.json({ error: 'Quote failed' }, { status: 500 });
  }
}
