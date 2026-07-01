import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { fulfillPurchase } from '@/lib/fulfill';
import { captureError } from '@/lib/monitoring';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const sig  = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status !== 'paid') {
        return NextResponse.json({ ok: true });
      }

      const { item_id, buyer_wallet, price_usdc } = session.metadata ?? {};
      if (!item_id || !buyer_wallet) {
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      const sessPi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      await fulfillPurchase(item_id, buyer_wallet, price_usdc, sessPi);
    } else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const { item_id, buyer_wallet, price_usdc } = pi.metadata ?? {};

      if (!item_id || !buyer_wallet) {
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      await fulfillPurchase(item_id, buyer_wallet, price_usdc, pi.id);
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    captureError(err, { stage: 'stripe webhook fulfill', event_type: event.type });
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
