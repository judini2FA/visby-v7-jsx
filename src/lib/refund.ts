import Stripe from 'stripe';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { sendSolFromAuthority } from '@/lib/solana-fund';
import { toCents } from '@/lib/fees';
import { solUsd } from '@/lib/price-oracle';

// Escrow refund. Mirror of releasePayout but in reverse: while buyer funds are still held (payout NOT
// released), return the full buyer payment. Card → refund the original Stripe charge. Crypto → the
// treasury sends the SOL value back to the buyer's wallet.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export type RefundOrder = {
  id: string;
  item_id?: string;
  buyer_wallet: string;
  pay_method?: string | null;
  payout_method?: 'card' | 'crypto' | string | null;
  payout_released?: boolean;
  price_usdc: number | null;
  stripe_payment_intent?: string | null;
};

export type RefundResult = { ok: boolean; refund_tx: string | null; error?: string };

async function solPriceUsd(): Promise<number | null> {
  // Fund-moving: always a fresh multi-source read (never cached) — see price-oracle.ts.
  const p = await solUsd({ fresh: true });
  return p > 0 ? p : null;
}

export async function refundOrder(order: RefundOrder): Promise<RefundResult> {
  const amount = Number(order.price_usdc ?? 0);
  if (Number.isNaN(amount) || amount <= 0) {
    return { ok: false, refund_tx: null, error: 'Invalid refund amount' };
  }

  // Hard guard: once the seller is paid the money has left escrow. Refunding here would pay the buyer
  // back while the seller keeps the proceeds — never do it automatically; it needs manual handling.
  if (order.payout_released === true) {
    return { ok: false, refund_tx: null, error: 'Seller already paid out; refund needs manual handling.' };
  }

  const method = order.payout_method ?? (order.pay_method === 'card' ? 'card' : 'crypto');

  try {
    if (method === 'card') {
      if (!order.stripe_payment_intent) {
        return { ok: false, refund_tx: null, error: 'No charge on file; refund needs manual review.' };
      }
      try {
        const refund = await stripe.refunds.create({
          payment_intent: order.stripe_payment_intent,
          metadata: { order_id: order.id, item_id: order.item_id ?? '' },
        });
        return { ok: true, refund_tx: refund.id };
      } catch (err) {
        return { ok: false, refund_tx: null, error: err instanceof Error ? err.message : 'Card refund failed' };
      }
    }

    // crypto: send the SOL value back from the treasury to the buyer. FX caveat: the treasury received
    // SOL at the purchase-time price and returns the same USD value at the current price — on devnet
    // that drift is immaterial; for mainnet, escrow in USDC or cap against the SOL originally received.
    const price = await solPriceUsd();
    if (!price || price <= 0) return { ok: false, refund_tx: null, error: 'SOL price feed unavailable.' };
    const lamports = Math.round((amount / price) * LAMPORTS_PER_SOL);
    if (lamports <= 0) return { ok: false, refund_tx: null, error: 'Refund amount rounds to zero SOL.' };
    try {
      const sig = await sendSolFromAuthority(order.buyer_wallet, lamports);
      return { ok: true, refund_tx: sig };
    } catch (err) {
      return { ok: false, refund_tx: null, error: err instanceof Error ? err.message : 'Crypto refund failed' };
    }
  } catch (err) {
    return { ok: false, refund_tx: null, error: err instanceof Error ? err.message : 'Refund failed' };
  }
}
