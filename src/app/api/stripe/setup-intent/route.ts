import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

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

export async function POST(req: Request) {
  try {
    const { wallet } = await req.json();
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });

    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const customerId = await getOrCreateCustomer(wallet);

    // Card-only so the client's confirmCardSetup() works cleanly. (automatic_payment_methods enables
    // redirect-based methods that require confirmSetup + a return_url, which silently breaks card saves.)
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    });

    return NextResponse.json({ client_secret: setupIntent.client_secret });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
