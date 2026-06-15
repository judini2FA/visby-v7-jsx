import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });

    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('wallet', wallet)
      .maybeSingle();

    if (!data?.stripe_customer_id) return NextResponse.json({ methods: [] });

    const result = await stripe.paymentMethods.list({
      customer: data.stripe_customer_id,
      type: 'card',
    });

    const methods = result.data.map(pm => ({
      id:       pm.id,
      brand:    pm.card?.brand ?? 'card',
      last4:    pm.card?.last4 ?? '????',
      exp_month: pm.card?.exp_month,
      exp_year:  pm.card?.exp_year,
    }));

    return NextResponse.json({ methods });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
