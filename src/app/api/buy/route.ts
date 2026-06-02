import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

          const supabase = await createClient();

          // Fetch the item to validate
          const { data: item, error: fetchError } = await supabase
            .from('items')
            .select('*')
            .eq('id', item_id)
            .single();

          if (fetchError || !item) {
                  return NextResponse.json({ error: 'Item not found' }, { status: 404 });
                }

          if (!item.is_listed) {
                  return NextResponse.json({ error: 'Item is not listed for sale' }, { status: 400 });
                }

          if (item.current_owner_wallet === buyer_wallet) {
                  return NextResponse.json({ error: 'You already own this item' }, { status: 400 });
                }

          // Simulate transaction hash (Phase 1)
          // Phase 2 will do real USDC SPL token transfer here
          const simulatedTxHash = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

          // Record the transfer
          const previousOwner = item.current_owner_wallet;
          const { error: updateError } = await supabase
            .from('items')
            .update({
                      current_owner_wallet: buyer_wallet,
                      is_listed: false,
                      price_usdc: null,
                    })
            .eq('id', item_id);

          if (updateError) {
                  return NextResponse.json({ error: updateError.message }, { status: 500 });
                }

          // Record ownership history
          await supabase.from('ownership_history').insert({
                  item_id,
                  owner_wallet: buyer_wallet,
                  from_wallet: previousOwner,
                  tx_hash: simulatedTxHash,
                  event_type: 'transfer',
                  price_usdc: item.price_usdc,
                });

          return NextResponse.json({
                  success: true,
                  tx_hash: simulatedTxHash,
                  new_owner: buyer_wallet,
                  price_usdc: item.price_usdc,
                  note: 'Phase 1: simulated transfer. Phase 2 adds real USDC SPL token transfer.',
                });
        } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 });
        }
  }
