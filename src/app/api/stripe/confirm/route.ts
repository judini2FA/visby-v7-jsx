import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority } from '@/lib/nft';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Supports both embedded (payment_intent_id) and hosted checkout (session_id)
    const { payment_intent_id, session_id } = body;

    let item_id: string, buyer_wallet: string, price_usdc: string, seller_wallet: string;

    if (payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (pi.status !== 'succeeded') return NextResponse.json({ error: 'Payment not completed' }, { status: 402 });
      ({ item_id, buyer_wallet, price_usdc, seller_wallet } = pi.metadata as any);
    } else if (session_id) {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status !== 'paid') return NextResponse.json({ error: 'Payment not completed' }, { status: 402 });
      ({ item_id, buyer_wallet, price_usdc } = session.metadata as any);
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

    return NextResponse.json({ ok: true, name: item.name, item_id: item.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
