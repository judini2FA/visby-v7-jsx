import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { finalizeSdkOrder } from '@/lib/sdk-settle';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// One-tap VisbyPay: charge the buyer's saved card OFF-SESSION, then run the shared settlement (mint +
// webhook). Authed — charging a stored card requires proving the caller owns the buyer wallet (unlike the
// manual flow, where the buyer types the card themselves and the PI metadata binds them).
export async function POST(req: Request) {
  try {
    const { session_id, buyer_wallet, payment_method_id } = await req.json();
    if (!session_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (buyer_wallet.startsWith('0x') || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(buyer_wallet)) {
      return NextResponse.json({ error: 'A valid Solana wallet is required' }, { status: 400 });
    }
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();

    const { data: order, error: orderErr } = await supabase
      .from('sdk_orders')
      .select('id, status, price_usdc')
      .eq('id', session_id)
      .maybeSingle();
    if (orderErr) return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503 });
    if (!order) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (order.status !== 'pending') return NextResponse.json({ error: 'Already settled' }, { status: 409 });

    const { data: cust } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('wallet', buyer_wallet)
      .maybeSingle();
    if (!cust?.stripe_customer_id) return NextResponse.json({ error: 'No saved card on file' }, { status: 400 });

    // Resolve which saved card to charge: the one the client passed (validated to belong to the customer),
    // else the customer's first card on file.
    const list = await stripe.paymentMethods.list({ customer: cust.stripe_customer_id, type: 'card' });
    const pmId = payment_method_id && list.data.some(pm => pm.id === payment_method_id)
      ? payment_method_id
      : list.data[0]?.id;
    if (!pmId) return NextResponse.json({ error: 'No saved card on file' }, { status: 400 });

    let pi: Stripe.PaymentIntent;
    try {
      // Idempotency key bound to the session: concurrent/retried one-tap calls (double-click, client retry,
      // duplicate SDK calls) collapse to a SINGLE charge instead of charging the saved card twice.
      pi = await stripe.paymentIntents.create({
        amount: Math.round(order.price_usdc * 100),
        currency: 'usd',
        customer: cust.stripe_customer_id,
        payment_method: pmId,
        confirm: true,
        off_session: true,
        metadata: { sdk_order_id: session_id, buyer_wallet, kind: 'visby_sdk' },
      }, { idempotencyKey: `sdk-charge-${session_id}` });
    } catch (e: any) {
      // Declines / authentication_required surface here for off-session charges — let the buyer pay another way.
      const msg = e?.code === 'authentication_required'
        ? 'This card needs verification — pay another way.'
        : (e?.message ?? 'Your card was declined — pay another way.');
      return NextResponse.json({ error: msg }, { status: 402 });
    }

    if (pi.status !== 'succeeded') {
      return NextResponse.json({ error: `Payment ${pi.status} — pay another way.` }, { status: 402 });
    }

    const fin = await finalizeSdkOrder({ session_id, buyer_wallet, payment_intent_id: pi.id });
    if (!fin.ok) return NextResponse.json({ error: fin.error }, { status: fin.status });
    return NextResponse.json({ ok: true, order_id: session_id, minted: fin.minted, nft_address: fin.nft_address, success_url: fin.success_url });
  } catch (err: unknown) {
    console.error('[sdk/charge-saved]', err);
    return NextResponse.json({ error: 'Payment processing error' }, { status: 500 });
  }
}
