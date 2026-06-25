import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority } from '@/lib/nft';
import { createOrder } from '@/lib/orders';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Supports both embedded (payment_intent_id) and hosted checkout (session_id)
    const { payment_intent_id, session_id } = body;

    let item_id: string, buyer_wallet: string, price_usdc: string, seller_wallet: string;
    // The PaymentIntent that the card payout/refund draws from. MUST be resolved for hosted checkout too
    // (the session metadata has no PI) or the seller can never be paid and the buyer can never be refunded.
    let resolvedPi: string | null = null;

    if (payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (pi.status !== 'succeeded') return NextResponse.json({ error: 'Payment not completed' }, { status: 402 });
      ({ item_id, buyer_wallet, price_usdc, seller_wallet } = pi.metadata as any);
      resolvedPi = payment_intent_id;
    } else if (session_id) {
      const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['payment_intent'] });
      if (session.payment_status !== 'paid') return NextResponse.json({ error: 'Payment not completed' }, { status: 402 });
      ({ item_id, buyer_wallet, price_usdc } = session.metadata as any);
      resolvedPi = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    } else {
      return NextResponse.json({ error: 'Missing payment_intent_id or session_id' }, { status: 400 });
    }

    if (!item_id || !buyer_wallet) return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: item } = await supabase.from('items').select('*').eq('id', item_id).single();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    // Idempotent — already transferred (e.g. webhook already fired)
    if (item.current_owner_wallet === buyer_wallet) {
      return NextResponse.json({ ok: true, already_transferred: true, name: item.name, item_id: item.id });
    }

    // Prevent double-transfer when a second PaymentIntent for the same item also succeeds
    if (!item.is_listed) {
      return NextResponse.json({ error: 'Item already sold' }, { status: 409 });
    }

    const previousOwner = item.current_owner_wallet;
    const nftTxHash = await transferFromAuthority(item.nft_mint_address, buyer_wallet);

    await supabase
      .from('items')
      .update({ current_owner_wallet: buyer_wallet, is_listed: false, price_usdc: null, listed_at: null })
      .eq('id', item_id);

    await supabase.from('ownership_history').insert({
      item_id,
      owner_wallet:  buyer_wallet,
      from_wallet:   previousOwner,
      tx_hash:       nftTxHash,
      event_type:    'transfer',
      price_usdc:    price_usdc ? parseFloat(price_usdc) : item.price_usdc,
    });

    await createOrder({
      item_id, buyer_wallet, seller_wallet: previousOwner,
      price_usdc: price_usdc ? parseFloat(price_usdc) : item.price_usdc,
      pay_method: 'card', nft_tx: nftTxHash,
      stripe_payment_intent: resolvedPi,
    });

    return NextResponse.json({ ok: true, name: item.name, item_id: item.id });
  } catch (err: unknown) {
    console.error('[stripe/confirm]', err);
    return NextResponse.json({ error: 'Payment processing error' }, { status: 500 });
  }
}
