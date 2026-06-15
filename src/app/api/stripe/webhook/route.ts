import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority } from '@/lib/nft';
import { createOrder } from '@/lib/orders';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = 'nodejs';

async function fulfillPurchase(item_id: string, buyer_wallet: string, price_usdc: string | undefined) {
  const supabase = createServiceClient();

  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('id', item_id)
    .single();

  if (!item) {
    throw new Error(`Item ${item_id} not found`);
  }

  // Idempotency guard — already transferred
  if (item.current_owner_wallet === buyer_wallet) {
    return;
  }

  if (!item.is_listed) {
    throw new Error(`Item ${item_id} is no longer listed`);
  }

  const previousOwner = item.current_owner_wallet;

  const txRef = await transferFromAuthority(item.nft_mint_address, buyer_wallet);

  await supabase
    .from('items')
    .update({ current_owner_wallet: buyer_wallet, is_listed: false, price_usdc: null, listed_at: null })
    .eq('id', item_id);

  await supabase.from('ownership_history').insert({
    item_id,
    owner_wallet: buyer_wallet,
    from_wallet:  previousOwner,
    tx_hash:      txRef,
    event_type:   'transfer',
    price_usdc:   price_usdc ? parseFloat(price_usdc) : item.price_usdc,
  });

  await createOrder({
    item_id, buyer_wallet, seller_wallet: previousOwner,
    price_usdc: price_usdc ? parseFloat(price_usdc) : item.price_usdc,
    pay_method: 'card', nft_tx: txRef,
  });
}

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

      await fulfillPurchase(item_id, buyer_wallet, price_usdc);
    } else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const { item_id, buyer_wallet, price_usdc } = pi.metadata ?? {};

      if (!item_id || !buyer_wallet) {
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      await fulfillPurchase(item_id, buyer_wallet, price_usdc);
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
