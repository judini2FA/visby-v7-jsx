import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Blueprint 4.1 — server foundation for Stripe Financial Connections bank linking.
// Starts a Financial Connections Session for the caller's wallet. The client finishes the
// flow with Stripe.js `collectFinancialConnectionsAccounts(client_secret)`, then calls
// POST /api/bank/complete with the returned session_id to persist the linked account(s).
export async function POST(req: Request) {
  try {
    const { wallet } = await req.json();
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
    }

    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.includes(wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`bank-create-session:${wallet}`, { limit: 10, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();

    // Reuse the existing stripe_customers table (wallet -> Stripe Customer) so bank accounts
    // and saved cards live on the same Customer object. Create one if the wallet has none yet.
    const { data: existing } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('wallet', wallet)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { wallet } });
      customerId = customer.id;
      const { error: upsertErr } = await supabase
        .from('stripe_customers')
        .upsert({ wallet, stripe_customer_id: customerId }, { onConflict: 'wallet' });
      if (upsertErr) {
        return NextResponse.json({ error: 'Could not provision customer' }, { status: 500 });
      }
    }

    const session = await stripe.financialConnections.sessions.create({
      account_holder: { type: 'customer', customer: customerId },
      permissions: ['balances', 'ownership', 'payment_method'],
      filters: { countries: ['US'] },
    });

    return NextResponse.json({ client_secret: session.client_secret, session_id: session.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Could not start bank link session' }, { status: 500 });
  }
}
