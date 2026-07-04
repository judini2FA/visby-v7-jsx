import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { taxEnabled, calculateOrderTax } from '@/lib/tax';

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

    const priceCents = Math.round(item.price_usdc * 100);

    // 4.9 Stripe Tax (flag-dark via STRIPE_TAX_ENABLED). When on, add marketplace-facilitator sales tax
    // to the buyer's charge from their saved shipping address. Flag-off → taxCents=0 and this whole block
    // is a no-op, so the PaymentIntent (amount, metadata) is byte-identical to pre-4.9.
    let taxCents = 0;
    let taxCalcId: string | null = null;
    if (taxEnabled()) {
      const { data: prof } = await supabase.from('profiles').select('ship_to').eq('wallet', buyer_wallet).maybeSingle();
      const t = await calculateOrderTax({ amountCents: priceCents, address: prof?.ship_to ?? {}, reference: item.id });
      taxCents = t.tax_cents;
      taxCalcId = t.calculation_id;
    }

    const metadata: Record<string, string> = {
      item_id:      item.id,
      buyer_wallet,
      price_usdc:   String(item.price_usdc),
      item_name:    item.name,
      seller_wallet: item.current_owner_wallet,
    };
    if (taxCents > 0) {
      metadata.tax_cents = String(taxCents);
      if (taxCalcId) metadata.tax_calc_id = taxCalcId;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: priceCents + taxCents,
      currency: 'usd',
      metadata,
      payment_method_types: ['card'],
    });

    return NextResponse.json({ client_secret: paymentIntent.client_secret, tax_cents: taxCents, total_cents: priceCents + taxCents });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
