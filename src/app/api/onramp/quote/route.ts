import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getSolPrice(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { signal: controller.signal, cache: 'no-store' }
    );
    const data = await r.json();
    return data.solana?.usd ?? 0;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const usdParam = searchParams.get('usd');
    const asset = searchParams.get('asset') ?? 'SOL';

    if (!usdParam) return NextResponse.json({ error: 'Missing usd param' }, { status: 400 });

    const usd = parseFloat(usdParam);
    if (isNaN(usd) || usd <= 0) {
      return NextResponse.json({ error: 'usd must be a positive number' }, { status: 400 });
    }

    const sol_price = await getSolPrice();
    if (sol_price === 0) {
      return NextResponse.json(
        { error: 'SOL price feed unavailable — try again shortly' },
        { status: 503 }
      );
    }

    const sol_amount = usd / sol_price;
    const lamports = Math.round(sol_amount * 1e9);

    return NextResponse.json({
      usd,
      asset,
      sol_price,
      sol_amount,
      sol_display: `${sol_amount.toFixed(4)} SOL`,
      lamports,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
