import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

async function getCgPrices(): Promise<{ eth: number; sol: number; btc: number }> {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum,bitcoin&vs_currencies=usd',
      { signal: controller.signal, cache: 'no-store' }
    );
    const data = await r.json();
    return {
      eth: data.ethereum?.usd ?? 0,
      sol: data.solana?.usd   ?? 0,
      btc: data.bitcoin?.usd  ?? 0,
    };
  } catch {
    return { eth: 0, sol: 0, btc: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const item_id = searchParams.get('item_id');
    if (!item_id) return NextResponse.json({ error: 'Missing item_id' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: item } = await supabase.from('items').select('price_usdc').eq('id', item_id).single();
    if (!item?.price_usdc) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const usd    = item.price_usdc as number;
    const prices = await getCgPrices();

    const solAmount = prices.sol > 0 ? usd / prices.sol : null;
    const ethAmount = prices.eth > 0 ? usd / prices.eth : null;
    const btcAmount = prices.btc > 0 ? usd / prices.btc : null;

    return NextResponse.json({
      price_usdc: usd,
      quotes: {
        USDC: { amount: usd,       display: `${usd.toFixed(2)} USDC`, rate_source: 'fixed' },
        SOL:  solAmount ? { amount: solAmount, display: `${solAmount.toFixed(4)} SOL`, rate_source: 'coingecko' } : null,
        ETH:  ethAmount ? { amount: ethAmount, display: `${ethAmount.toFixed(5)} ETH`, rate_source: 'coingecko' } : null,
        BTC:  btcAmount ? { amount: btcAmount, display: `${btcAmount.toFixed(6)} BTC`, rate_source: 'coingecko' } : null,
      },
      rates: { eth_usd: prices.eth, sol_usd: prices.sol, btc_usd: prices.btc },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
