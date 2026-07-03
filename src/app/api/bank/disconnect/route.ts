import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Blueprint 4.1 — marks a linked bank account disconnected. The DB row is the source of truth
// for what Visby considers "linked"; the Stripe-side disconnect is best-effort (wrapped in
// try/catch) so a Stripe API hiccup never blocks the user from removing an account on their end.
export async function POST(req: Request) {
  try {
    const { wallet, id } = await req.json();
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
    }
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.includes(wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`bank-disconnect:${wallet}`, { limit: 10, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();
    const { data: row, error: fetchErr } = await supabase
      .from('linked_bank_accounts')
      .select('id, wallet, fc_account_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !row) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    if (row.wallet !== wallet) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (row.fc_account_id) {
      try {
        await stripe.financialConnections.accounts.disconnect(row.fc_account_id);
      } catch {
        // Best-effort: Stripe-side disconnect failing (already disconnected, API hiccup, etc.)
        // must not block the user from removing the account from their Visby linked list.
      }
    }

    const { error: updateErr } = await supabase
      .from('linked_bank_accounts')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Could not disconnect account' }, { status: 500 });
  }
}
