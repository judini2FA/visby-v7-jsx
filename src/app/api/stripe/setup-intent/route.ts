import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Returns (or creates) the Stripe Customer ID for a wallet address
async function getOrCreateCustomer(wallet: string): Promise<string> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('wallet', wallet)
    .maybeSingle();

  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const customer = await stripe.customers.create({
    metadata: { wallet },
    description: `Visby user: ${wallet}`,
  });

  await supabase.from('stripe_customers').insert({ wallet, stripe_customer_id: customer.id });
  return customer.id;
}

export { getOrCreateCustomer };

export async function POST(req: Request) {
  try {
    const { wallet } = await req.json();
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });

    const customerId = await getOrCreateCustomer(wallet);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({ client_secret: setupIntent.client_secret });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
