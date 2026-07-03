import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { callerOwnsWallet } from '@/lib/auth';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { disburseOnramp } from '@/lib/onramp-disburse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(`onramp-fulfill:${clientIp(req)}`, { limit: 20, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const { payment_intent_id } = await req.json();
    if (!payment_intent_id || typeof payment_intent_id !== 'string') {
      return NextResponse.json({ error: 'Missing payment_intent_id' }, { status: 400 });
    }

    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (pi.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Payment not complete — status is '${pi.status}'` },
        { status: 402 }
      );
    }

    // Only the signed-in owner of the payment's destination wallet may trigger delivery. Funds could
    // never be redirected (the wallet is fixed in the PI metadata), but an unauthenticated endpoint that
    // moves treasury crypto on demand is still an open door.
    if (!(await callerOwnsWallet(req, pi.metadata?.wallet))) {
      return NextResponse.json({ error: 'Not authorized — please sign in.' }, { status: 401 });
    }

    const result = await disburseOnramp(stripe, pi);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const { ok, already_fulfilled, asset, token_amount, sol_amount, tx, new_balance } = result;
    return NextResponse.json({ ok, already_fulfilled, asset, token_amount, sol_amount, tx, new_balance });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
