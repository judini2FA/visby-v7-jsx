import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { sendSolFromAuthority } from '@/lib/solana-fund';
import { captureError } from '@/lib/monitoring';
import { solUsd } from '@/lib/price-oracle';
import { createServiceClient } from '@/lib/supabase/service';
import { getConnectStatus, payoutToConnect } from '@/lib/stripe-connect';

// Escrow release. Buyer funds are held until delivery is confirmed; then the seller's net
// (price − platform fee − shipping) is paid to their PRIMARY payout method.
//
// Today the only payout-CAPABLE method is the seller's Visby crypto wallet — you can't push funds onto a
// credit card, and bank rails aren't built yet. So every sale (card OR crypto) settles to the seller's
// wallet in SOL from the treasury, and Visby keeps the buyer's USD/crypto as the float. When a bank rail
// lands and is a seller's Primary, route it here via Stripe Connect; until then, wallet is the Primary.
//
// FX caveat: the treasury received SOL at purchase-time price and disburses net-USD-worth at the current
// price — immaterial on devnet; for mainnet, escrow in USDC or cap per-order against SOL received.
// Idempotency is the caller's job (release only once, gated on payout not already done).

export type PayoutOrder = {
  id: string;
  item_id?: string;
  seller_wallet: string;
  payout_method?: 'card' | 'crypto' | string | null;
  seller_net_usd: number;            // already computed: price − fee − shipping
  gross_usd?: number | null;         // order price (for the crypto FX-cap ratio: seller gets ≤ net/gross of received SOL)
  received_lamports?: number | null; // SOL actually received at purchase (crypto) — cap the payout against this
  stripe_payment_intent?: string | null;
};

export type PayoutResult = { ok: boolean; payout_tx: string | null; error?: string };

async function solPriceUsd(): Promise<number | null> {
  // Fund-moving: always a fresh multi-source read (never cached) — see price-oracle.ts.
  const p = await solUsd({ fresh: true });
  return p > 0 ? p : null;
}

// Blueprint 4.3 — seller-opt-in FIAT payout rail (Stripe Connect), additive over the crypto default.
//
// Returns:
//   null                 → seller is NOT on the fiat rail (no bank preference, onboarding incomplete,
//                          or any lookup miss/error). The caller then runs the unchanged crypto path.
//   PayoutResult (ok)    → fiat transfer succeeded; payout_tx = Stripe transfer id.
//   PayoutResult (!ok)   → seller IS on the fiat rail but the transfer failed. Returned as-is so the
//                          release is left retryable — we do NOT silently downgrade a bank-preferring
//                          seller to a crypto payout (that would risk double-paying on a later retry).
//
// The gate fires only when the seller explicitly chose bank (payout_settings.payout_type === 'bank')
// AND finished Connect onboarding (seller_connect_accounts.payouts_enabled). Any DB error → null →
// crypto default, so this can never strand a payout by mis-reading a preference.
//
// Idempotency: payoutToConnect keys on the order id, so a retried release (retry-payout endpoint, or a
// buyer-confirm + carrier-webhook double fire) can never move the money twice within Stripe's window.
//
// Treasury note: on a crypto-paid order the buyer's SOL sits in the treasury while USD leaves Visby's
// Stripe balance — a deliberate FX/liquidity position, not a bug (the seller is owed `net` either way).
async function maybeConnectPayout(order: PayoutOrder, net: number): Promise<PayoutResult | null> {
  const wallet = order.seller_wallet;
  const supabase = createServiceClient();

  const { data: pref, error: prefErr } = await supabase
    .from('payout_settings')
    .select('payout_type')
    .eq('seller_wallet', wallet)
    .maybeSingle();
  if (prefErr) return null;                          // can't read preference → crypto default
  if (pref?.payout_type !== 'bank') return null;     // not opted into fiat → crypto default

  const status = await getConnectStatus(wallet);
  if (!status?.stripe_account_id || !status.payouts_enabled) return null; // onboarding incomplete → crypto default

  const res = await payoutToConnect({ wallet, amountUsd: net, idempotencyKey: `connect-payout:${order.id}` });
  return { ok: res.ok, payout_tx: res.transfer_id ?? null, error: res.error };
}

export async function releasePayout(order: PayoutOrder): Promise<PayoutResult> {
  const net = Number(order.seller_net_usd);
  if (!Number.isFinite(net)) {
    console.error('[payout] invalid net for order', order.id, order.seller_net_usd);
    return { ok: false, payout_tx: null, error: 'Invalid net amount' };
  }
  if (net <= 0) return { ok: true, payout_tx: null }; // nothing owed (e.g. shipping ≥ net)
  if (!order.seller_wallet) return { ok: false, payout_tx: null, error: 'No seller wallet on file for payout.' };

  // Seller-opt-in fiat rail (4.3). Only a bank-preferring, fully-onboarded seller lands here; every
  // other case (incl. any DB error) returns null and falls through to the unchanged crypto path below.
  // A THROW in the gate must never cost a seller their payout, so it's caught and treated as "not on
  // the fiat rail" → crypto default.
  try {
    const fiat = await maybeConnectPayout(order, net);
    if (fiat) return fiat;
  } catch (err) {
    captureError(err, { stage: 'releasePayout.fiatGate', order_id: order.id, seller_wallet: order.seller_wallet });
  }

  try {
    const solUsd = await solPriceUsd();
    if (!solUsd || solUsd <= 0) return { ok: false, payout_tx: null, error: 'SOL price feed unavailable.' };
    let lamports = Math.round((net / solUsd) * LAMPORTS_PER_SOL);

    // FX CAP (crypto purchases only): the treasury received `received_lamports` of SOL for this order. Never
    // disburse more SOL to the seller than their net share of what actually came in — otherwise a drop in
    // SOL between purchase and delivery would have the treasury paying out more SOL than it took in. Card
    // purchases settled in USD (no SOL received) keep the current-price conversion, bounded by the USD float.
    const isCrypto = (order.payout_method ?? 'crypto') === 'crypto';
    if (isCrypto && order.received_lamports && order.received_lamports > 0 && order.gross_usd && order.gross_usd > 0) {
      const capLamports = Math.floor(order.received_lamports * (net / order.gross_usd));
      if (lamports > capLamports) lamports = capLamports;
    }

    if (lamports <= 0) return { ok: true, payout_tx: null };
    const sig = await sendSolFromAuthority(order.seller_wallet, lamports);
    return { ok: true, payout_tx: sig };
  } catch (err) {
    console.error('[payout] release failed:', err);
    captureError(err, { stage: 'releasePayout', order_id: order.id, seller_wallet: order.seller_wallet, net });
    return { ok: false, payout_tx: null, error: err instanceof Error ? err.message : 'Payout failed' };
  }
}
