import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority, getRpcUrl } from '@/lib/nft';
import { callerOwnsWallet } from '@/lib/auth';
import { createOrder } from '@/lib/orders';

// Settles a Li.Fi crypto-swap purchase and transfers the NFT to the buyer.
//
// DEVNET NOTE: the marketplace runs on Solana devnet, while Li.Fi swaps execute against mainnet
// liquidity — so the ETH→USDC swap itself cannot run here. This endpoint records the swap intent
// and performs the on-chain NFT transfer (the part that IS real on devnet). On mainnet, the swap
// would execute via the Li.Fi SDK provider and settle USDC to the seller before this transfer.
export async function POST(req: Request) {
  try {
    if (getRpcUrl().includes('mainnet')) {
      return NextResponse.json({ error: 'Simulated swap settlement is disabled on mainnet' }, { status: 503 });
    }

    const { item_id, buyer_wallet, from_currency, from_amount } = await req.json();
    if (!item_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (buyer_wallet.startsWith('0x')) return NextResponse.json({ error: 'Solana wallet required' }, { status: 400 });
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: item } = await supabase.from('items').select('*').eq('id', item_id).single();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (!item.is_listed || !item.price_usdc) return NextResponse.json({ error: 'Not listed' }, { status: 400 });

    // Idempotent — already transferred
    if (item.current_owner_wallet === buyer_wallet) {
      return NextResponse.json({ ok: true, already_transferred: true, item_id: item.id });
    }

    const previousOwner = item.current_owner_wallet;
    const pricePaid = item.price_usdc;

    // Compare-and-swap: only one request wins; concurrent buyers get 409
    const { data: casRows } = await supabase
      .from('items')
      .update({ current_owner_wallet: buyer_wallet, is_listed: false, price_usdc: null, listed_at: null })
      .eq('id', item_id)
      .eq('is_listed', true)
      .select();

    if (!casRows || casRows.length === 0) {
      return NextResponse.json({ error: 'Item already sold' }, { status: 409 });
    }

    const nftTxHash = await transferFromAuthority(item.nft_mint_address, buyer_wallet);

    await supabase.from('ownership_history').insert({
      item_id,
      owner_wallet: buyer_wallet,
      from_wallet:  previousOwner,
      tx_hash:      nftTxHash,
      event_type:   'transfer',
      price_usdc:   pricePaid,
    });

    await createOrder({
      item_id, buyer_wallet, seller_wallet: previousOwner,
      price_usdc: pricePaid, pay_method: (from_currency ?? 'eth').toLowerCase(), nft_tx: nftTxHash,
    });

    return NextResponse.json({
      ok: true,
      simulated: true,
      item_id: item.id,
      nft_tx: nftTxHash,
      paid_with: from_currency ?? 'ETH',
      paid_amount: from_amount ?? null,
    });
  } catch (err) {
    console.error('[lifi/swap-pay]', err);
    return NextResponse.json({ error: 'Settlement failed' }, { status: 500 });
  }
}
