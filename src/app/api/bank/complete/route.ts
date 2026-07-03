import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Blueprint 4.1 — completes a Financial Connections Session after the client finishes the
// Stripe.js modal (collectFinancialConnectionsAccounts). Reads the accounts the user picked
// and upserts them into linked_bank_accounts. Idempotent: re-running with the same session_id
// just re-upserts the same rows (unique on wallet + fc_account_id).
export async function POST(req: Request) {
  try {
    const { wallet, session_id } = await req.json();
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
    }
    if (!session_id || typeof session_id !== 'string') {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    }

    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.includes(wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`bank-complete:${wallet}`, { limit: 10, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();

    const { data: cust } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('wallet', wallet)
      .maybeSingle();

    const session = await stripe.financialConnections.sessions.retrieve(session_id);

    // The session's account_holder must match the caller's own Customer — otherwise a caller
    // could pass someone else's session_id and have their accounts linked to their own wallet.
    const sessionCustomerId =
      typeof session.account_holder?.customer === 'string'
        ? session.account_holder.customer
        : session.account_holder?.customer?.id;
    if (!sessionCustomerId || sessionCustomerId !== cust?.stripe_customer_id) {
      return NextResponse.json({ error: 'Session does not belong to this wallet' }, { status: 403 });
    }

    const linkedAccounts = session.accounts?.data ?? [];
    const compact: Array<{ id: string; institution_name: string | null; last4: string | null }> = [];

    for (const account of linkedAccounts) {
      const { error } = await supabase.from('linked_bank_accounts').upsert(
        {
          wallet,
          stripe_customer_id: sessionCustomerId,
          fc_account_id: account.id,
          institution_name: account.institution_name ?? null,
          last4: account.last4 ?? null,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'wallet,fc_account_id' }
      );
      if (error) {
        return NextResponse.json({ error: `Could not save linked account: ${error.message}` }, { status: 500 });
      }
      compact.push({ id: account.id, institution_name: account.institution_name ?? null, last4: account.last4 ?? null });
    }

    return NextResponse.json({ ok: true, accounts: compact });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Could not complete bank link' }, { status: 500 });
  }
}
