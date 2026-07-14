import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext } from '@/lib/auth';
import { getAuthorityUsdcBalance } from '@/lib/solana-fund';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { disburseOnramp } from '@/lib/onramp-disburse';
import { requireStepUp } from '@/lib/step-up';
import { onrampChargeAction } from '@/lib/step-up-shared';
import { isBanned } from '@/lib/account-status';
import { friendlyError } from '@/lib/friendly-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Add funds from a SAVED card (off-session), then disburse the token from the treasury. Same disbursement
// as /onramp/fulfill, but the charge is server-confirmed against a stored payment method instead of a
// freshly-typed card. If the charge succeeds but the disburse fails, we return the PI id (202) so the
// client can complete delivery via the idempotent /onramp/fulfill — the card is never charged twice
// (idempotency key) and the user is never left paid-without-tokens.
export async function POST(req: Request) {
  try {
    const { wallet, usd, asset: assetRaw, payment_method_id, idempotency_key } = await req.json();
    const asset = assetRaw === 'USDC' ? 'USDC' : 'SOL';

    if (typeof usd !== 'number' || usd < 1 || usd > 1000) {
      return NextResponse.json({ error: 'usd must be a number between 1 and 1000' }, { status: 400 });
    }
    if (!wallet || typeof wallet !== 'string' || wallet.startsWith('0x')) {
      return NextResponse.json({ error: 'A valid Solana wallet is required' }, { status: 400 });
    }
    if (!payment_method_id || typeof payment_method_id !== 'string') {
      return NextResponse.json({ error: 'payment_method_id is required' }, { status: 400 });
    }
    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.includes(wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ban-freeze: only a BAN locks a user out of moving their own money (buying tokens with a saved
    // card is still "their own funds", it just enters via card rather than leaves via transfer).
    // Suspension alone does not block this. Fails open on a DB error so an outage never freezes a
    // legitimate user's funds.
    if (await isBanned(ctx.wallets)) return NextResponse.json({ error: 'account_banned' }, { status: 403 });

    const rl = await rateLimit(`onramp-charge-saved:${wallet}`, { limit: 8, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    // MFA step-up: this charges a SAVED card off-session (card -> crypto) without the card being
    // re-entered, so it gets the same step-up as a send. Fresh-card purchases (CardPayForm, buyer typing
    // card details) are untouched. Dormant until NEXT_PUBLIC_STEP_UP_ENFORCED=1.
    const stepUp = await requireStepUp(req, wallet, onrampChargeAction(wallet, usd, asset), ctx.userId);
    if (stepUp) return stepUp;

    // Don't charge for USDC the treasury can't deliver (USDC is 1:1 with USD).
    if (asset === 'USDC') {
      const treasury = await getAuthorityUsdcBalance().catch(() => 0);
      if (treasury < usd) {
        return NextResponse.json(
          { error: 'USDC funding is being set up — try SOL for now, or use the devnet USDC faucet.' },
          { status: 503 }
        );
      }
    }

    const supabase = createServiceClient();
    const { data: cust } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('wallet', wallet)
      .maybeSingle();
    if (!cust?.stripe_customer_id) {
      return NextResponse.json({ error: 'No saved payment method on file' }, { status: 400 });
    }

    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.create(
        {
          amount: Math.round(usd * 100),
          currency: 'usd',
          customer: cust.stripe_customer_id,
          payment_method: payment_method_id,
          confirm: true,
          off_session: true,
          metadata: { wallet, usd: String(usd), asset, kind: 'onramp' },
        },
        idempotency_key ? { idempotencyKey: `onramp_${idempotency_key}` } : undefined
      );
    } catch (chargeErr: any) {
      return NextResponse.json({ error: friendlyError(chargeErr, 'Card was declined.') }, { status: 402 });
    }

    if (pi.status !== 'succeeded') {
      return NextResponse.json({ error: `Payment ${pi.status} — try a different card` }, { status: 402 });
    }

    // Charge cleared — disburse through the shared exactly-once path (atomic claim, multi-source price
    // feed). A failure here leaves the PI succeeded-but-unfulfilled, completable via /onramp/fulfill.
    const result = await disburseOnramp(stripe, pi);
    if (result.ok) {
      const { tx, asset: a, token_amount, sol_amount, new_balance } = result;
      return NextResponse.json({ ok: true, tx, asset: a, token_amount, sol_amount, new_balance });
    }
    return NextResponse.json(
      { ok: false, charged: true, payment_intent_id: pi.id, error: 'Payment received — finishing delivery…' },
      { status: 202 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: friendlyError(err, 'Could not complete the payment — try again.') }, { status: 500 });
  }
}
