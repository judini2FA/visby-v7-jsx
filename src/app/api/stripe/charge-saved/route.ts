import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority } from '@/lib/nft';
import { callerOwnsWallet } from '@/lib/auth';
import { createOrder } from '@/lib/orders';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { item_id, buyer_wallet, payment_method_id } = await req.json();
    if (!item_id || !buyer_wallet || !payment_method_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();

    // Get Stripe customer for this wallet
    const { data: cust } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('wallet', buyer_wallet)
      .maybeSingle();

    if (!cust?.stripe_customer_id) {
      return NextResponse.json({ error: 'No saved payment method on file' }, { status: 400 });
    }

    // Fetch item and validate it's still listed
    const { data: item } = await supabase.from('items').select('*').eq('id', item_id).single();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (!item.is_listed || !item.price_usdc) return NextResponse.json({ error: 'Item no longer listed' }, { status: 400 });
    if (item.current_owner_wallet === buyer_wallet) return NextResponse.json({ error: 'You already own this' }, { status: 400 });

    // Create and immediately confirm the PaymentIntent server-side — no client action needed
    const paymentIntent = await stripe.paymentIntents.create({
      amount:          Math.round(item.price_usdc * 100),
      currency:        'usd',
      customer:        cust.stripe_customer_id,
      payment_method:  payment_method_id,
      confirm:         true,
      off_session:     true,
      metadata: {
        item_id:       item.id,
        buyer_wallet,
        price_usdc:    String(item.price_usdc),
        seller_wallet: item.current_owner_wallet,
      },
    });

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: `Payment ${paymentIntent.status} — try a different card` }, { status: 402 });
    }

    const previousOwner = item.current_owner_wallet;
    const nftTxHash     = await transferFromAuthority(item.nft_mint_address, buyer_wallet);

    await supabase
      .from('items')
      .update({ current_owner_wallet: buyer_wallet, is_listed: false, price_usdc: null, listed_at: null })
      .eq('id', item_id);

    await supabase.from('ownership_history').insert({
      item_id,
      owner_wallet: buyer_wallet,
      from_wallet:  previousOwner,
      tx_hash:      nftTxHash,
      event_type:   'transfer',
      price_usdc:   item.price_usdc,
    });

    await createOrder({
      item_id, buyer_wallet, seller_wallet: previousOwner,
      price_usdc: item.price_usdc,
      pay_method: 'card', nft_tx: nftTxHash,
      stripe_payment_intent: paymentIntent.id,
    });

    return NextResponse.json({ ok: true, item_id: item.id, name: item.name });
  } catch (err: any) {
    // Stripe throws StripeCardError for declined cards — surface the message
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
