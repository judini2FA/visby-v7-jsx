import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority, getRpcUrl } from '@/lib/nft';

const TREASURY = process.env.MINT_AUTHORITY_ADDRESS!;
// Allow up to 2% slippage from quoted price at time of payment
const SLIPPAGE_TOLERANCE = 0.02;

async function getSolPrice(): Promise<number> {
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
  const d = await r.json();
  return d.solana?.usd ?? 0;
}

export async function POST(req: Request) {
  try {
    const { item_id, tx_signature, buyer_wallet } = await req.json();
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
    const treasuryKey = new PublicKey(TREASURY);
    const accountKeys = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys().staticAccountKeys
      : (tx.transaction.message as any).accountKeys as PublicKey[];

    const treasuryIdx = accountKeys.findIndex(k => k.toBase58() === TREASURY);
    if (treasuryIdx === -1) return NextResponse.json({ error: 'Treasury not found in transaction' }, { status: 400 });

    const preBalance  = tx.meta!.preBalances[treasuryIdx]  ?? 0;
    const postBalance = tx.meta!.postBalances[treasuryIdx] ?? 0;
    const solReceived = (postBalance - preBalance) / 1e9;

    if (solReceived <= 0) return NextResponse.json({ error: 'No SOL received at treasury' }, { status: 400 });

    // Verify buyer is the signer (first account in transaction)
    const signerKey = accountKeys[0]?.toBase58();
    if (signerKey !== buyer_wallet) {
      return NextResponse.json({ error: 'Transaction signer does not match buyer_wallet' }, { status: 400 });
    }

    // Verify amount matches price (with slippage tolerance)
    const solPrice = await getSolPrice();
    const solPriceAtPayment = solReceived * solPrice;
    const expectedUsd = item.price_usdc;
    const discrepancy = Math.abs(solPriceAtPayment - expectedUsd) / expectedUsd;

    if (discrepancy > SLIPPAGE_TOLERANCE) {
      return NextResponse.json({
        error: `Payment amount mismatch: received $${solPriceAtPayment.toFixed(2)} USD equivalent, expected $${expectedUsd.toFixed(2)} (${(discrepancy * 100).toFixed(1)}% difference)`,
      }, { status: 400 });
    }

    // Transfer NFT on-chain
    const previousOwner = item.current_owner_wallet;
    const nftTxHash = await transferFromAuthority(item.nft_mint_address, buyer_wallet);

    await supabase
      .from('items')
      .update({ current_owner_wallet: buyer_wallet, is_listed: false, price_usdc: null, listed_at: null })
      .eq('id', item_id);

    await supabase.from('ownership_history').insert({
      item_id,
      owner_wallet:  buyer_wallet,
      from_wallet:   previousOwner,
      tx_hash:       nftTxHash,
      event_type:    'transfer',
      price_usdc:    item.price_usdc,
    });

    return NextResponse.json({ ok: true, item_id: item.id, nft_tx: nftTxHash });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
