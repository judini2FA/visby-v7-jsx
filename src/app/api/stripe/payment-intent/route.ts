import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { taxEnabled, calculateOrderTax } from '@/lib/tax';
import { getAuthedContext } from '@/lib/auth';
import { resolveCheckoutPrice } from '@/lib/offers';
import { friendlyError } from '@/lib/friendly-error';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    // Auth FIRST: buyer_wallet drives the offer-price lookup, so it must be a wallet the signed-in user
    // actually controls — otherwise an unauthed caller could name a victim who holds an accepted offer
    // (or any wallet) and mint a PI in their name. The PI's metadata is the sole evidence the webhook trusts.
    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { item_id, buyer_wallet } = await req.json();
    if (!item_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!ctx.wallets.includes(buyer_wallet)) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: item } = await supabase.from('items').select('*').eq('id', item_id).single();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (!item.is_listed || !item.price_usdc) return NextResponse.json({ error: 'Not listed' }, { status: 400 });
    if (item.current_owner_wallet === buyer_wallet) return NextResponse.json({ error: 'You already own this item' }, { status: 400 });

    // Offers (7.3): an accepted, unexpired offer for THIS authenticated buyer lowers the price (clamped
    // <= list); otherwise the list price. Fails soft to list on any error. The offer price is locked into
    // the PI metadata below — the webhook/confirm record from metadata, never re-resolving (that would
    // fail-soft to list after consumeOffer runs and overcharge).
    const { priceUsd, offerId } = await resolveCheckoutPrice(item, buyer_wallet);
    const priceCents = Math.round(priceUsd * 100);

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
      price_usdc:   String(priceUsd),
      item_name:    item.name,
      seller_wallet: item.current_owner_wallet,
    };
    if (offerId) metadata.offer_id = offerId;
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
    return NextResponse.json({ error: friendlyError(err, 'Could not start checkout — try again.') }, { status: 500 });
  }
}
