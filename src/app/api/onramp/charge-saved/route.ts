import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import {
  sendSolFromAuthority, getSolBalance,
  sendUsdcFromAuthority, getUsdcBalance, getAuthorityUsdcBalance,
} from '@/lib/solana-fund';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function getSolPrice(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { signal: controller.signal, cache: 'no-store' }
    );
    const data = await r.json();
    return data.solana?.usd ?? 0;
  } finally {
    clearTimeout(timeout);
  }
}

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
    if (!(await callerOwnsWallet(req, wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`onramp-charge-saved:${wallet}`, { limit: 8, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

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
      return NextResponse.json({ error: chargeErr.message ?? 'Card was declined' }, { status: 402 });
    }

    if (pi.status !== 'succeeded') {
      return NextResponse.json({ error: `Payment ${pi.status} — try a different card` }, { status: 402 });
    }

    // Charge cleared — disburse. A failure here leaves the PI succeeded-but-unfulfilled, completable via
    // /onramp/fulfill (which keys off the same metadata + the fulfilled flag).
    try {
      if (asset === 'USDC') {
        const token_amount = usd;
        const tx = await sendUsdcFromAuthority(wallet, token_amount);
        await stripe.paymentIntents.update(pi.id, { metadata: { ...pi.metadata, fulfilled: 'true', token_amount: String(token_amount) } });
        const new_balance = await getUsdcBalance(wallet);
        return NextResponse.json({ ok: true, tx, asset: 'USDC', token_amount, new_balance });
      }

      const sol_price = await getSolPrice();
      if (sol_price === 0) throw new Error('SOL price feed unavailable');
      const sol_amount = usd / sol_price;
      const tx = await sendSolFromAuthority(wallet, Math.round(sol_amount * 1e9));
      await stripe.paymentIntents.update(pi.id, { metadata: { ...pi.metadata, fulfilled: 'true', sol_amount: String(sol_amount), token_amount: String(sol_amount) } });
      const new_balance = await getSolBalance(wallet);
      return NextResponse.json({ ok: true, tx, asset: 'SOL', sol_amount, token_amount: sol_amount, new_balance });
    } catch {
      return NextResponse.json(
        { ok: false, charged: true, payment_intent_id: pi.id, error: 'Payment received — finishing delivery…' },
        { status: 202 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
