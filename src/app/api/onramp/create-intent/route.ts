import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAuthorityUsdcBalance } from '@/lib/solana-fund';
import { friendlyError } from '@/lib/friendly-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { wallet, usd, asset: assetRaw } = await req.json();
    const asset = assetRaw === 'USDC' ? 'USDC' : 'SOL';

    if (typeof usd !== 'number' || usd < 1 || usd > 1000) {
      return NextResponse.json(
        { error: 'usd must be a number between 1 and 1000' },
        { status: 400 }
      );
    }
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
    }
    if (wallet.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Ethereum address supplied — a Solana wallet address is required' },
        { status: 400 }
      );
    }

    // Don't charge a card for USDC the treasury can't deliver. USDC is 1:1, so usd == USDC owed.
    if (asset === 'USDC') {
      const treasury = await getAuthorityUsdcBalance().catch(() => 0);
      if (treasury < usd) {
        return NextResponse.json(
          { error: 'USDC funding is being set up — try SOL for now, or use the devnet USDC faucet.' },
          { status: 503 }
        );
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(usd * 100),
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        wallet,
        usd: String(usd),
        asset,
      },
    });

    return NextResponse.json({ client_secret: paymentIntent.client_secret });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyError(err, 'Could not start the payment — try again.') }, { status: 500 });
  }
}
