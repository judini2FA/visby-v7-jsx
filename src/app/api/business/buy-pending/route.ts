import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { createServiceClient } from '@/lib/supabase/service';
import { getRpcUrl } from '@/lib/nft';
import { settlePendingSerialSale } from '@/lib/pending-serial-sale';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { captureError, captureMessage } from '@/lib/monitoring';
import { solUsd } from '@/lib/price-oracle';

// Phase 2.3 — buyer-facing crypto purchase of a pre-logged (unminted) business serial. This is the FIRST
// time real money is verified to move for this serial, so on-chain verification is REPLICATED from
// /api/sol-pay/route.ts field-for-field: fetch the tx by signature, confirm no on-chain error, locate the
// treasury in accountKeys, compute lamports actually received (post-pre, never trust a client-reported
// amount), confirm the buyer is the transaction's signer, price the SOL with the server oracle (never the
// client's quote alone), and check the resulting USD value is within SLIPPAGE_TOLERANCE of the pending
// serial's listed price_usdc. Only after all of that clears do we hand off to settlePendingSerialSale,
// whose own CAS claim on pending_serials is the exactly-once guard against double-mint.

const TREASURY = process.env.MINT_AUTHORITY_ADDRESS!;
// Allow up to 2% slippage from quoted price at time of payment — identical tolerance to sol-pay/sdk-settle
// so a buyer sees consistent behavior regardless of which purchase path they're on.
const SLIPPAGE_TOLERANCE = 0.02;

async function getSolPrice(): Promise<number | null> {
  // Fund-moving (slippage check): always a fresh multi-source read — see price-oracle.ts.
  const p = await solUsd({ fresh: true });
  return p > 0 ? p : null;
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(`buy-pending:${clientIp(req)}`, { limit: 20, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const { pending_serial_id, tx_signature, buyer_wallet, quoted_sol_price } = await req.json();
    if (!pending_serial_id || !tx_signature || !buyer_wallet) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (typeof buyer_wallet === 'string' && buyer_wallet.startsWith('0x')) {
      return NextResponse.json({ error: 'A Solana wallet is required (got an Ethereum address)' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: pending } = await supabase
      .from('pending_serials')
      .select('*')
      .eq('id', pending_serial_id)
      .single();

    if (!pending) return NextResponse.json({ error: 'Pending serial not found' }, { status: 404 });

    // Idempotent — already minted+sold to this buyer. Mirrors sol-pay's already-transferred short-circuit
    // so a client retry (double-tap, network blip) after success doesn't error the buyer.
    if (pending.status === 'minted' && pending.minted_item_id) {
      const { data: item } = await supabase
        .from('items').select('id, current_owner_wallet').eq('id', pending.minted_item_id).maybeSingle();
      if (item && item.current_owner_wallet === buyer_wallet) {
        return NextResponse.json({ ok: true, already_settled: true, item_id: item.id });
      }
    }
    if (pending.status !== 'pending') {
      return NextResponse.json({ error: 'This item is no longer available' }, { status: 409 });
    }
    if (pending.price_usdc == null || Number(pending.price_usdc) <= 0) {
      return NextResponse.json({ error: 'This item has no listed price yet' }, { status: 400 });
    }

    // Verify on-chain SOL transfer.
    const connection = new Connection(getRpcUrl(), 'confirmed');
    const tx = await connection.getTransaction(tx_signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) return NextResponse.json({ error: 'Transaction not found on-chain' }, { status: 400 });
    if (tx.meta?.err) return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });

    // Verify the transaction sent SOL to treasury.
    const accountKeys = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys().staticAccountKeys
      : (tx.transaction.message as any).accountKeys as PublicKey[];

    const treasuryIdx = accountKeys.findIndex(k => k.toBase58() === TREASURY);
    if (treasuryIdx === -1) return NextResponse.json({ error: 'Treasury not found in transaction' }, { status: 400 });

    const preBalance       = tx.meta!.preBalances[treasuryIdx]  ?? 0;
    const postBalance      = tx.meta!.postBalances[treasuryIdx] ?? 0;
    const receivedLamports = postBalance - preBalance;
    const solReceived      = receivedLamports / 1e9;

    if (solReceived <= 0) return NextResponse.json({ error: 'No SOL received at treasury' }, { status: 400 });

    // Verify buyer is the signer (first account in transaction).
    const signerKey = accountKeys[0]?.toBase58();
    if (signerKey !== buyer_wallet) {
      return NextResponse.json({ error: 'Transaction signer does not match buyer_wallet' }, { status: 400 });
    }

    // Verify amount matches price (with slippage tolerance). Value the SOL with the server-side oracle —
    // never the client-supplied quote alone, which a buyer could inflate so a token amount of real SOL
    // clears the USD check. The quote is honored only as a UX hint when it already agrees with the oracle;
    // otherwise we fall back to the oracle, which a padded transfer can't satisfy.
    const oraclePrice = await getSolPrice();
    if (!oraclePrice) {
      return NextResponse.json({ error: 'Price feed unavailable, retry' }, { status: 503 });
    }
    const quoteWithinTolerance =
      typeof quoted_sol_price === 'number' && quoted_sol_price > 0 &&
      Math.abs(quoted_sol_price - oraclePrice) / oraclePrice <= SLIPPAGE_TOLERANCE;
    const solPrice = quoteWithinTolerance ? quoted_sol_price : oraclePrice;
    const solPriceAtPayment = solReceived * solPrice;
    const expectedUsd = Number(pending.price_usdc);
    const discrepancy = Math.abs(solPriceAtPayment - expectedUsd) / expectedUsd;

    if (discrepancy > SLIPPAGE_TOLERANCE) {
      return NextResponse.json({
        error: `Payment amount mismatch: received $${solPriceAtPayment.toFixed(2)} USD equivalent, expected $${expectedUsd.toFixed(2)} (${(discrepancy * 100).toFixed(1)}% difference)`,
      }, { status: 400 });
    }

    // Replay guard, INSERT-FIRST (atomic): claim the signature before touching money/minting. sol_payments
    // .signature is the PK, so a duplicate insert hits a unique violation (23505) → replay, reject. No
    // check-then-insert race. item_id is left null here (no items row exists yet — this serial hasn't
    // minted); the real item_id is unrecoverable from this table alone but the signature itself is the
    // durable proof this exact transaction was already consumed. Tolerant: if the table is absent
    // (sandbox) the guard is skipped, as in sol-pay.
    {
      const { error: dupErr } = await supabase
        .from('sol_payments')
        .insert({ signature: tx_signature, item_id: null, buyer_wallet });
      if (dupErr?.code === '23505') {
        return NextResponse.json({ error: 'Transaction already used' }, { status: 409 });
      }
      // any other error (table missing / unreachable) — continue without the guard, matching sol-pay's tolerance
    }

    // Real funds are now verified at treasury and the signature is claimed. Hand off to the mint-on-sale
    // settlement, whose CAS claim on pending_serials (pending → minted) is the exactly-once guard against
    // two concurrent buyers minting the same physical serial twice.
    const result = await settlePendingSerialSale({
      pendingSerialId: pending_serial_id,
      buyerWallet: buyer_wallet,
      pricePaidUsd: expectedUsd,
      paymentRef: tx_signature,
    });

    if (!result.ok) {
      // The buyer's SOL is already in the treasury at this point, so a settlement failure must be surfaced
      // loudly for reconciliation, never silently swallowed — the money is real even if the mint isn't.
      console.error(`[buy-pending] CRITICAL: payment verified but settlement failed — funds in treasury, ` +
        `no confirmed sale. sig=${tx_signature} pending_serial_id=${pending_serial_id} buyer=${buyer_wallet} error=${result.error}`);
      captureMessage('error', '[buy-pending] settlement failed after verified payment', {
        tx_signature, pending_serial_id, buyer_wallet, error: result.error,
      });
      return NextResponse.json({
        error: result.error,
        payment_verified: true,
        warning: 'Your payment was received but the order could not be completed automatically. This has been flagged for manual resolution.',
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      item_id: result.item_id,
      mint_address: result.mint_address,
      mint_tx: result.tx_hash,
      transfer_tx: result.transfer_tx,
      already_settled: result.already_settled ?? false,
      provenance_pending: !result.transfer_tx,
    });
  } catch (err: unknown) {
    console.error('[buy-pending] unexpected error:', err);
    captureError(err, { stage: 'buy-pending POST' });
    return NextResponse.json({ error: 'Payment processing error' }, { status: 500 });
  }
}
