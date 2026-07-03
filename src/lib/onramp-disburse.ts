import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { sendSolFromAuthority, getSolBalance, sendUsdcFromAuthority, getUsdcBalance } from '@/lib/solana-fund';
import { solUsd } from '@/lib/price-oracle';
import { captureError } from '@/lib/monitoring';

export type DisburseOutcome =
  | { ok: true; already_fulfilled: boolean; asset: 'SOL' | 'USDC'; token_amount: number; sol_amount: number; tx?: string; new_balance: number }
  | { ok: false; status: number; error: string };

// PostgREST codes for "table hasn't been migrated yet" — the lock degrades to the legacy
// metadata-flag guard instead of blocking on-ramps entirely.
const isMissingTable = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';

async function alreadyResult(pi: Stripe.PaymentIntent, asset: 'SOL' | 'USDC', wallet: string, tokenAmount?: number): Promise<DisburseOutcome> {
  const new_balance = asset === 'USDC' ? await getUsdcBalance(wallet) : await getSolBalance(wallet);
  const amount = tokenAmount ?? parseFloat(pi.metadata.token_amount ?? pi.metadata.sol_amount ?? '0');
  return { ok: true, already_fulfilled: true, asset, token_amount: amount, sol_amount: asset === 'SOL' ? amount : 0, new_balance };
}

// Disburse crypto for a SUCCEEDED on-ramp PaymentIntent, exactly once. The caller has already verified
// pi.status === 'succeeded' and that the requester is authorized for pi.metadata.wallet.
//
// Exactly-once is enforced by an atomic claim: INSERT into onramp_fulfillments (payment_intent_id is the
// primary key) — one concurrent request wins and disburses; losers see the existing row and either return
// the recorded result ('done') or 409 ('disbursing', client retries). The Stripe metadata `fulfilled`
// flag is kept as a visible audit trail and as the fallback guard until the migration runs.
export async function disburseOnramp(stripe: Stripe, pi: Stripe.PaymentIntent): Promise<DisburseOutcome> {
  const { wallet, usd, fulfilled, asset: assetRaw } = pi.metadata as { wallet: string; usd: string; fulfilled?: string; asset?: string };
  const asset: 'SOL' | 'USDC' = assetRaw === 'USDC' ? 'USDC' : 'SOL';

  if (!wallet || wallet.startsWith('0x')) return { ok: false, status: 400, error: 'Payment has no valid Solana destination wallet' };
  if (fulfilled === 'true') return alreadyResult(pi, asset, wallet);

  const usdNum = parseFloat(usd);
  if (!Number.isFinite(usdNum) || usdNum <= 0) return { ok: false, status: 400, error: 'Payment has no valid USD amount' };

  const supabase = createServiceClient();
  let locked = false;
  const { error: claimErr } = await supabase
    .from('onramp_fulfillments')
    .insert({ payment_intent_id: pi.id, wallet, asset, status: 'disbursing' });
  if (!claimErr) {
    locked = true;
  } else if (claimErr.code === '23505') {
    const { data: row } = await supabase
      .from('onramp_fulfillments')
      .select('status, token_amount')
      .eq('payment_intent_id', pi.id)
      .maybeSingle();
    if (row?.status === 'done') return alreadyResult(pi, asset, wallet, Number(row.token_amount ?? 0) || undefined);
    return { ok: false, status: 409, error: 'Delivery already in progress — one moment…' };
  } else if (!isMissingTable(claimErr.code)) {
    captureError(claimErr, { stage: 'onramp disburse claim', payment_intent_id: pi.id });
    return { ok: false, status: 500, error: 'Could not start delivery — please retry' };
  }

  const release = async () => {
    if (locked) await supabase.from('onramp_fulfillments').delete().eq('payment_intent_id', pi.id).eq('status', 'disbursing');
  };

  try {
    let token_amount: number;
    let sol_amount = 0;
    let tx: string;

    if (asset === 'USDC') {
      // USDC is 1:1 with USD — disburse exactly what was paid.
      token_amount = usdNum;
      tx = await sendUsdcFromAuthority(wallet, token_amount);
    } else {
      const sol_price = await solUsd({ fresh: true });
      if (sol_price === 0) {
        await release();
        return { ok: false, status: 503, error: 'SOL price feed unavailable — cannot calculate disbursement' };
      }
      sol_amount = usdNum / sol_price;
      token_amount = sol_amount;
      tx = await sendSolFromAuthority(wallet, Math.round(sol_amount * 1e9));
    }

    if (locked) {
      await supabase
        .from('onramp_fulfillments')
        .update({ status: 'done', token_amount, tx, done_at: new Date().toISOString() })
        .eq('payment_intent_id', pi.id);
    }
    // Best-effort audit trail — the DB row above is the authoritative guard.
    await stripe.paymentIntents.update(pi.id, {
      metadata: { ...pi.metadata, fulfilled: 'true', token_amount: String(token_amount), ...(asset === 'SOL' ? { sol_amount: String(sol_amount) } : {}) },
    }).catch((e) => captureError(e, { stage: 'onramp disburse metadata', payment_intent_id: pi.id }));

    const new_balance = asset === 'USDC' ? await getUsdcBalance(wallet) : await getSolBalance(wallet);
    return { ok: true, already_fulfilled: false, asset, token_amount, sol_amount, tx, new_balance };
  } catch (err: any) {
    await release();
    captureError(err, { stage: 'onramp disburse send', payment_intent_id: pi.id });
    return { ok: false, status: 500, error: err?.message ?? 'Delivery failed — your payment is safe, please retry' };
  }
}
