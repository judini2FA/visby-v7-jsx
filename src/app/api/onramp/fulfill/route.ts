import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { callerOwnsWallet, getAuthedContext } from '@/lib/auth';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { disburseOnramp } from '@/lib/onramp-disburse';
import { isBanned } from '@/lib/account-status';

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

    // Ban-freeze: only a BAN locks a user out of moving their own money. This delivers tokens the user
    // already paid Stripe for, but a banned account still shouldn't be able to pull treasury crypto on
    // demand — the charge itself can be refunded out-of-band. Fails open on a DB error so an outage
    // never freezes a legitimate user's funds. Resolve via getAuthedContext (not just the single
    // pi.metadata.wallet) so a ban on any of the caller's linked wallets is honored, mirroring the
    // other money routes.
    const authCtx = await getAuthedContext(req);
    if (await isBanned(authCtx?.wallets ?? [pi.metadata?.wallet].filter(Boolean) as string[])) {
      return NextResponse.json({ error: 'account_banned' }, { status: 403 });
    }

    const result = await disburseOnramp(stripe, pi);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const { ok, already_fulfilled, asset, token_amount, sol_amount, tx, new_balance } = result;
    return NextResponse.json({ ok, already_fulfilled, asset, token_amount, sol_amount, tx, new_balance });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
