import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendSolFromAuthority, getSolBalance } from '@/lib/solana-fund';

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

export async function POST(req: Request) {
  try {
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

    const { wallet, usd, fulfilled } = pi.metadata as {
      wallet: string;
      usd: string;
      fulfilled?: string;
    };

    if (fulfilled === 'true') {
      const new_balance = await getSolBalance(wallet);
      return NextResponse.json({
        ok: true,
        already_fulfilled: true,
        asset: 'SOL',
        sol_amount: parseFloat(pi.metadata.sol_amount ?? '0'),
        new_balance,
      });
    }

    const sol_price = await getSolPrice();
    if (sol_price === 0) {
      return NextResponse.json(
        { error: 'SOL price feed unavailable — cannot calculate disbursement' },
        { status: 503 }
      );
    }

    const usdNum = parseFloat(usd);
    const sol_amount = usdNum / sol_price;
    const lamports = Math.round(sol_amount * 1e9);

    const tx = await sendSolFromAuthority(wallet, lamports);

    await stripe.paymentIntents.update(payment_intent_id, {
      metadata: { ...pi.metadata, fulfilled: 'true', sol_amount: String(sol_amount) },
    });

    const new_balance = await getSolBalance(wallet);

    return NextResponse.json({
      ok: true,
      tx,
      asset: 'SOL',
      sol_amount,
      new_balance,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
