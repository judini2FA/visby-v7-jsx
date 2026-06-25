import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function missingSchema(error: any): boolean {
  const code = error?.code;
  if (code === '42P01' || code === 'PGRST205') return true;
  return typeof error?.message === 'string' && error.message.includes('does not exist');
}

export async function POST(req: Request) {
  try {
    const { session_id, buyer_wallet } = await req.json();
    if (!session_id || !buyer_wallet) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    // Bind a valid Solana wallet to the PI now — settle will mint to whatever this metadata says, so a bad
    // (ETH/garbage) wallet must be rejected before the buyer is charged.
    if (buyer_wallet.startsWith('0x') || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(buyer_wallet)) {
      return NextResponse.json({ error: 'A valid Solana wallet is required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: order, error } = await supabase
      .from('sdk_orders')
      .select('*')
      .eq('id', session_id)
      .maybeSingle();

    if (error) {
      if (missingSchema(error)) return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503 });
      return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503 });
    }
    if (!order) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (order.status !== 'pending') return NextResponse.json({ error: 'Session not payable' }, { status: 409 });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.price_usdc * 100),
      currency: 'usd',
      metadata: {
        sdk_order_id: session_id,
        buyer_wallet,
        kind: 'visby_sdk',
      },
      payment_method_types: ['card'],
    });

    await supabase
      .from('sdk_orders')
      .update({ stripe_payment_intent: paymentIntent.id })
      .eq('id', session_id);

    return NextResponse.json({ client_secret: paymentIntent.client_secret });
  } catch (err: unknown) {
    console.error('[sdk/payment-intent]', err);
    return NextResponse.json({ error: 'Payment processing error' }, { status: 500 });
  }
}
