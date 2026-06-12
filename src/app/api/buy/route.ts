import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority } from '@/lib/nft';

/**
 * Phase 1 Buy Route
 * -----------------
 * For Phase 1 (devnet), we simulate the USDC transfer
 * and record the ownership change in Supabase.
 * 
 * Phase 2 will add real USDC token transfers via @solana/web3.js
 * and SPL token program.
 */
export async function POST(req: Request) {
    try {
          const { item_id, buyer_wallet, serial } = await req.json();

          if (!item_id || !buyer_wallet) {
                  return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

          const supabase = createServiceClient();

          if (!serial) return NextResponse.json({ error: 'Missing serial' }, { status: 400 });
          if (buyer_wallet.startsWith('0x')) return NextResponse.json({ error: 'Solana wallet required' }, { status: 400 });

          // Fetch the item to validate — use limit(1) to avoid .single() failing on dupes
          const { data: rows, error: fetchError } = await supabase
            .from('items')
            .select('*')
            .eq('serial_number', serial)
            .order('created_at', { ascending: false })
            .limit(1);

          console.log('[buy] serial:', serial, 'rows:', rows?.length, 'err:', fetchError?.message);
          const item = rows?.[0];

          if (fetchError || !item) {
                  return NextResponse.json({ error: 'Item not found', detail: fetchError?.message }, { status: 404 });
                }

          if (!item.is_listed) {
                  return NextResponse.json({ error: 'Item is not listed for sale' }, { status: 400 });
                }

          if (item.current_owner_wallet === buyer_wallet) {
                  return NextResponse.json({ error: 'You already own this item' }, { status: 400 });
                }

          // Transfer NFT on-chain: escrow (mint authority) → buyer
          const nftTxHash = await transferFromAuthority(item.nft_mint_address, buyer_wallet);

          const previousOwner = item.current_owner_wallet;
          const { error: updateError } = await supabase
            .from('items')
            .update({
                      current_owner_wallet: buyer_wallet,
                      is_listed: false,
                      price_usdc: null,
                    })
            .eq('id', item.id);

          if (updateError) {
                  return NextResponse.json({ error: updateError.message }, { status: 500 });
                }

          // Record ownership history
          await supabase.from('ownership_history').insert({
                  item_id: item.id,
                  owner_wallet: buyer_wallet,
                  from_wallet: previousOwner,
                  tx_hash: nftTxHash,
                  event_type: 'transfer',
                  price_usdc: item.price_usdc,
                });

          return NextResponse.json({
                  success: true,
                  tx_hash: nftTxHash,
                  new_owner: buyer_wallet,
                  price_usdc: item.price_usdc,
                });
        } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 });
        }
  }
