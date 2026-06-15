import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { payment_method_id, wallet } = await req.json();
    if (!payment_method_id || !wallet) {
      return NextResponse.json({ error: 'Missing payment_method_id or wallet' }, { status: 400 });
    }

    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('wallet', wallet)
      .maybeSingle();

    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: 'No payment account found for this wallet' }, { status: 403 });
    }

    const pm = await stripe.paymentMethods.retrieve(payment_method_id);
    if (pm.customer !== data.stripe_customer_id) {
      return NextResponse.json({ error: 'Not your payment method' }, { status: 403 });
    }

    await stripe.paymentMethods.detach(payment_method_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[delete-payment-method]', err);
    return NextResponse.json({ error: 'Could not remove card' }, { status: 500 });
  }
}
