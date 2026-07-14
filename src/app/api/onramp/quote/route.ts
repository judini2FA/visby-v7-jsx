import { NextResponse } from 'next/server';
import { solUsd } from '@/lib/price-oracle';
import { friendlyError } from '@/lib/friendly-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    if (asset.toUpperCase() === 'USDC') {
      // USDC is a USD stablecoin — 1:1, no price feed needed.
      return NextResponse.json({
        usd,
        asset: 'USDC',
        unit_price: 1,
        token_amount: usd,
        token_display: `${usd.toFixed(2)} USDC`,
        lamports: 0,
      });
    }

    const sol_price = await solUsd();
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
      asset: 'SOL',
      unit_price: sol_price,
      sol_price,
      sol_amount,
      sol_display: `${sol_amount.toFixed(4)} SOL`,
      token_amount: sol_amount,
      token_display: `${sol_amount.toFixed(4)} SOL`,
      lamports,
    });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyError(err, 'Could not get a price quote — try again.') }, { status: 500 });
  }
}
