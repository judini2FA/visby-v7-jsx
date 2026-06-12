import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin') ?? req.headers.get('referer')?.replace(/\/$/, '') ?? 'http://localhost:3001';
    const { item_id, serial, buyer_wallet } = await req.json();

    if (!item_id || !buyer_wallet) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: item, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', item_id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    if (!item.is_listed || !item.price_usdc) {
      return NextResponse.json({ error: 'Item is not listed for sale' }, { status: 400 });
    }
    if (item.current_owner_wallet === buyer_wallet) {
      return NextResponse.json({ error: 'You already own this item' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: item.name,
              description: `${item.condition} · ${item.category} · Serial: ${item.serial_number}`,
              ...(item.image_url ? { images: [item.image_url] } : {}),
            },
            unit_amount: Math.round(item.price_usdc * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        item_id: item.id,
        serial_number: item.serial_number,
        buyer_wallet,
        price_usdc: String(item.price_usdc),
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/item/${item.id}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
