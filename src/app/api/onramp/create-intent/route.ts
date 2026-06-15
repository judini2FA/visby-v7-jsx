import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { wallet, usd } = await req.json();

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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(usd * 100),
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        wallet,
        usd: String(usd),
        asset: 'SOL',
      },
    });

    return NextResponse.json({ client_secret: paymentIntent.client_secret });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
