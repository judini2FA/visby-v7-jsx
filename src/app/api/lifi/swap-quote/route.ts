import { NextResponse } from 'next/server';
import { createClient, getQuote, ChainId } from '@lifi/sdk';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const USDC_ETH   = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ETH_NATIVE = '0x0000000000000000000000000000000000000000';
// Quote-only addresses (Li.Fi needs valid addresses to estimate gas/route); never sign anything.
const EVM_ADDR   = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const BTC_ADDR   = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const BTC_CHAIN  = 20000000000001; // Li.Fi Bitcoin chain id

const lifi = createClient({ integrator: 'Visby' });

type Cfg = {
  cgId: string;          // CoinGecko price id
  label: string;         // 'ETH' | 'BTC'
  decimals: number;      // 18 eth / 8 btc
  display: (n: number) => string;
  buildQuote: (fromAmount: string) => any;
};

const CONFIGS: Record<string, Cfg> = {
  ETH: {
    cgId: 'ethereum', label: 'ETH', decimals: 18,
    display: n => `${n.toFixed(5)} ETH`,
    buildQuote: fromAmount => ({
      fromAddress: EVM_ADDR,
      fromChain: ChainId.ETH, toChain: ChainId.ETH,
      fromToken: ETH_NATIVE,  toToken: USDC_ETH,
      fromAmount,
    }),
  },
  BTC: {
    cgId: 'bitcoin', label: 'BTC', decimals: 8,
    display: n => `${n.toFixed(6)} BTC`,
    buildQuote: fromAmount => ({
      fromAddress: BTC_ADDR, toAddress: EVM_ADDR,
      fromChain: BTC_CHAIN, toChain: ChainId.ETH,
      fromToken: 'bitcoin',  toToken: USDC_ETH,
      fromAmount,
    }),
  },
};

async function getUsd(cgId: string): Promise<number> {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`, { cache: 'no-store' });
    const d = await r.json();
    return d[cgId]?.usd ?? 0;
  } catch { return 0; }
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

    const cfg = CONFIGS[from];
    if (!cfg) return NextResponse.json({ error: `Unsupported currency: ${from}` }, { status: 400 });

    const supabase = createServiceClient();
    const { data: item } = await supabase.from('items').select('price_usdc').eq('id', item_id).single();
    if (!item?.price_usdc) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const targetUsd = item.price_usdc as number;
    const tokenUsd  = await getUsd(cfg.cgId);
    if (tokenUsd <= 0) return NextResponse.json({ error: 'Price feed unavailable' }, { status: 503 });

    const fromAmount = targetUsd / tokenUsd;
    const fromBase   = toBaseUnits(fromAmount, cfg.decimals);

    try {
      const quote = await getQuote(lifi, cfg.buildQuote(fromBase));
      const e = quote.estimate;
      const usdcOut = Number(e.toAmount) / 1e6;
      const gasUsd  = (e.gasCosts ?? []).reduce((s, g: any) => s + Number(g.amountUSD ?? 0), 0);

      return NextResponse.json({
        from: cfg.label,
        source: 'lifi',
        tool: quote.toolDetails?.name ?? quote.tool,
        target_usd: targetUsd,
        from_amount: fromAmount,
        from_amount_display: cfg.display(fromAmount),
        usdc_out: usdcOut,
        usdc_out_display: `${usdcOut.toFixed(2)} USDC`,
        gas_usd: gasUsd,
        duration_s: e.executionDuration ?? 0,
        token_usd: tokenUsd,
      });
    } catch {
      return NextResponse.json({
        from: cfg.label,
        source: 'estimate',
        tool: null,
        target_usd: targetUsd,
        from_amount: fromAmount,
        from_amount_display: cfg.display(fromAmount),
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
