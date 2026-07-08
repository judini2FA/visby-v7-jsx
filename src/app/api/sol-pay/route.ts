import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority, getRpcUrl } from '@/lib/nft';
import { createOrder } from '@/lib/orders';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { captureError, captureMessage } from '@/lib/monitoring';
import { solUsd } from '@/lib/price-oracle';
import { resolveCheckoutPrice } from '@/lib/offers';

const TREASURY = process.env.MINT_AUTHORITY_ADDRESS!;
// Allow up to 2% slippage from quoted price at time of payment
const SLIPPAGE_TOLERANCE = 0.02;

async function getSolPrice(): Promise<number | null> {
  // Fund-moving (slippage check): always a fresh multi-source read — see price-oracle.ts.
  const p = await solUsd({ fresh: true });
  return p > 0 ? p : null;
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(`sol-pay:${clientIp(req)}`, { limit: 20, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const { item_id, tx_signature, buyer_wallet, quoted_sol_price } = await req.json();
    if (!item_id || !tx_signature || !buyer_wallet) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: item } = await supabase.from('items').select('*').eq('id', item_id).single();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (!item.is_listed || !item.price_usdc) return NextResponse.json({ error: 'Not listed' }, { status: 400 });

    // Idempotent — already transferred
    if (item.current_owner_wallet === buyer_wallet) {
      return NextResponse.json({ ok: true, already_transferred: true, item_id: item.id });
    }

    // Verify on-chain SOL transfer
    const connection = new Connection(getRpcUrl(), 'confirmed');
    const tx = await connection.getTransaction(tx_signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) return NextResponse.json({ error: 'Transaction not found on-chain' }, { status: 400 });
    if (tx.meta?.err) return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });

    // Verify the transaction sent SOL to treasury
    const accountKeys = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys().staticAccountKeys
      : (tx.transaction.message as any).accountKeys as PublicKey[];

    const treasuryIdx = accountKeys.findIndex(k => k.toBase58() === TREASURY);
    if (treasuryIdx === -1) return NextResponse.json({ error: 'Treasury not found in transaction' }, { status: 400 });

    const preBalance      = tx.meta!.preBalances[treasuryIdx]  ?? 0;
    const postBalance     = tx.meta!.postBalances[treasuryIdx] ?? 0;
    const receivedLamports = postBalance - preBalance;
    const solReceived     = receivedLamports / 1e9;

    if (solReceived <= 0) return NextResponse.json({ error: 'No SOL received at treasury' }, { status: 400 });

    // Verify buyer is the signer (first account in transaction)
    const signerKey = accountKeys[0]?.toBase58();
    if (signerKey !== buyer_wallet) {
      return NextResponse.json({ error: 'Transaction signer does not match buyer_wallet' }, { status: 400 });
    }

    // Offers (7.3): the buyer authenticates by signing the on-chain payment above, so buyer_wallet is
    // trusted here. Resolve the accepted-offer price (else list) and verify the SOL they sent against THAT
    // — otherwise an accepted-offer buyer who correctly sends the discounted SOL would fail the amount check.
    const { priceUsd } = await resolveCheckoutPrice(item, buyer_wallet);
    if (!(priceUsd > 0)) return NextResponse.json({ error: 'Item price unavailable' }, { status: 400 }); // guard the discrepancy division below

    // Verify amount matches price (with slippage tolerance). Value the SOL with the server-side oracle —
    // never the client-supplied quote alone, which a buyer could inflate (e.g. 4000 vs the real ~200) so a
    // token amount of real SOL clears the USD check. The quote is honored only as a UX hint when it already
    // agrees with the oracle; otherwise we fall back to the oracle, which a padded transfer can't satisfy.
    const oraclePrice = await getSolPrice();
    if (!oraclePrice) {
      return NextResponse.json({ error: 'Price feed unavailable, retry' }, { status: 503 });
    }
    const quoteWithinTolerance =
      typeof quoted_sol_price === 'number' && quoted_sol_price > 0 &&
      Math.abs(quoted_sol_price - oraclePrice) / oraclePrice <= SLIPPAGE_TOLERANCE;
    const solPrice = quoteWithinTolerance ? quoted_sol_price : oraclePrice;
    const solPriceAtPayment = solReceived * solPrice;
    const expectedUsd = priceUsd;
    const discrepancy = Math.abs(solPriceAtPayment - expectedUsd) / expectedUsd;

    if (discrepancy > SLIPPAGE_TOLERANCE) {
      return NextResponse.json({
        error: `Payment amount mismatch: received $${solPriceAtPayment.toFixed(2)} USD equivalent, expected $${expectedUsd.toFixed(2)} (${(discrepancy * 100).toFixed(1)}% difference)`,
      }, { status: 400 });
    }

    // Replay guard, INSERT-FIRST (atomic): claim the signature before touching money. sol_payments.signature
    // is the PK, so a duplicate insert hits a unique violation (23505) → replay, reject. No check-then-insert
    // race. Tolerant: if the table is absent (sandbox) the guard is skipped, as before.
    {
      const { error: dupErr } = await supabase
        .from('sol_payments')
        .insert({ signature: tx_signature, item_id, buyer_wallet });
      if (dupErr?.code === '23505') {
        return NextResponse.json({ error: 'Transaction already used' }, { status: 409 });
      }
      // any other error (table missing / unreachable) — continue without the guard, matching prior tolerance
    }

    // CAS: atomically mark as sold before touching the chain
    const previousOwner = item.current_owner_wallet;
    const { data: casRows } = await supabase
      .from('items')
      .update({ current_owner_wallet: buyer_wallet, is_listed: false, price_usdc: null, listed_at: null })
      .eq('id', item_id)
      .eq('is_listed', true)
      .select();

    if (!casRows || casRows.length === 0) {
      return NextResponse.json({ error: 'Item already sold' }, { status: 409 });
    }

    // Transfer the provenance NFT on-chain (only reached after CAS wins). Retry a few times for
    // transient RPC failures before giving up.
    let nftTxHash: string | null = null;
    let transferError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { nftTxHash = await transferFromAuthority(item.nft_mint_address, buyer_wallet); break; }
      catch (e) { transferError = e; }
    }

    // The buyer's SOL is already in the treasury, so the paid sale MUST be recorded durably even if the
    // NFT didn't move — otherwise the funds are stranded with no order to drive fulfillment/payout/refund,
    // and (because the item is already marked sold to this buyer) a retry would short-circuit to a false
    // success. We never roll the listing back here: that would risk the buyer paying a second time on
    // retry. Instead we record the order now and leave provenance to be re-transferred out-of-band.
    if (nftTxHash) {
      await supabase.from('ownership_history').insert({
        item_id,
        owner_wallet:  buyer_wallet,
        from_wallet:   previousOwner,
        tx_hash:       nftTxHash,
        event_type:    'transfer',
        price_usdc:    priceUsd,
      });
    }

    const orderRecorded = await createOrder({
      item_id, buyer_wallet, seller_wallet: previousOwner,
      price_usdc: priceUsd, pay_method: 'sol', nft_tx: nftTxHash,
      received_lamports: receivedLamports,   // for the delivery-time FX cap (never pay out more SOL than received)
    });
    // (signature already claimed insert-first above — no late insert needed.)
    if (!orderRecorded) {
      console.error(`[sol-pay] CRITICAL: order NOT recorded for a paid sale — funds in treasury + NFT moved, ` +
        `reconcile from sol_payments. sig=${tx_signature} item=${item_id} buyer=${buyer_wallet}`);
      captureMessage('error', '[sol-pay] order NOT recorded for paid sale', { sig: tx_signature, item_id, buyer_wallet });
    }

    if (!nftTxHash) {
      console.error('[sol-pay] SOL captured + order recorded but provenance transfer failed (pending):', transferError);
      captureError(transferError ?? new Error('provenance transfer failed'), { stage: 'sol-pay provenance pending', item_id, buyer_wallet });
      return NextResponse.json({
        ok: true, item_id: item.id, nft_tx: null, provenance_pending: true,
        warning: 'Payment received and your order is recorded. The provenance NFT transfer is pending and will be completed shortly.',
      });
    }

    return NextResponse.json({ ok: true, item_id: item.id, nft_tx: nftTxHash, order_recorded: orderRecorded });
  } catch (err: unknown) {
    console.error('[sol-pay] unexpected error:', err);
    captureError(err, { stage: 'sol-pay POST' });
    return NextResponse.json({ error: 'Payment processing error' }, { status: 500 });
  }
}
