import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { item_id, buyer_wallet } = await req.json();
    if (!item_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: item } = await supabase.from('items').select('*').eq('id', item_id).single();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (!item.is_listed || !item.price_usdc) return NextResponse.json({ error: 'Not listed' }, { status: 400 });
    if (item.current_owner_wallet === buyer_wallet) return NextResponse.json({ error: 'You already own this item' }, { status: 400 });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(item.price_usdc * 100),
      currency: 'usd',
      metadata: {
        item_id:      item.id,
        buyer_wallet,
        price_usdc:   String(item.price_usdc),
        item_name:    item.name,
        seller_wallet: item.current_owner_wallet,
      },
      payment_method_types: ['card'],
    });

    return NextResponse.json({ client_secret: paymentIntent.client_secret });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
