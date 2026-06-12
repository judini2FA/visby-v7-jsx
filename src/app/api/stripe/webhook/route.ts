import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority } from '@/lib/nft';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Raw body needed for Stripe signature verification
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ ok: true });
    }

    const { item_id, serial_number, buyer_wallet, price_usdc } = session.metadata ?? {};
    if (!item_id || !buyer_wallet) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: item } = await supabase
      .from('items')
      .select('*')
      .eq('id', item_id)
      .single();

    if (!item || !item.is_listed) {
      // Already transferred or not listed — idempotent, no error
      return NextResponse.json({ ok: true });
    }

    const previousOwner = item.current_owner_wallet;

    // Transfer NFT on-chain first — webhook is authoritative, confirm route is idempotent fallback
    let txRef: string;
    try {
      txRef = await transferFromAuthority(item.nft_mint_address, buyer_wallet);
    } catch {
      // Fall back to payment_intent as tx ref if on-chain transfer fails
      txRef = `stripe_${typeof session.payment_intent === 'string' ? session.payment_intent : session.id}`;
    }

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
  }

  return NextResponse.json({ ok: true });
}
