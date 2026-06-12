import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { payment_method_id } = await req.json();
    if (!payment_method_id) return NextResponse.json({ error: 'Missing payment_method_id' }, { status: 400 });
    await stripe.paymentMethods.detach(payment_method_id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
