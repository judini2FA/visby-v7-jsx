import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createClient } from '@/lib/supabase/server';

export const nftRouter = createTRPCRouter({
    // Record a newly minted NFT in Supabase
    recordMint: publicProcedure
      .input(
              z.object({
                        name: z.string(),
                        serial_number: z.string(),
                        condition: z.enum(['new', 'like_new', 'good', 'fair']),
                        image_url: z.string().url().optional(),
                        arweave_url: z.string().optional(),
                        nft_mint_address: z.string(),
                        owner_wallet: z.string(),
                        tx_hash: z.string(),
                        category: z.string().optional(),
                        description: z.string().optional(),
                      })
            )
      .mutation(async ({ input }) => {
              const supabase = await createClient();

              // Insert the item
              const { data: item, error: itemError } = await supabase
                .from('items')
                .insert({
                            name: input.name,
                            serial_number: input.serial_number,
                            condition: input.condition,
                            image_url: input.image_url,
                            arweave_metadata_url: input.arweave_url,
                            nft_mint_address: input.nft_mint_address,
                            current_owner_wallet: input.owner_wallet,
                            category: input.category ?? 'Other',
                            description: input.description,
                            is_listed: false,
                          })
                .select()
                .single();

              if (itemError) throw new Error(itemError.message);

              // Insert first ownership record
              await supabase.from('ownership_history').insert({
                        item_id: item.id,
                        owner_wallet: input.owner_wallet,
                        tx_hash: input.tx_hash,
                        event_type: 'mint',
                        price_usdc: null,
                      });

              return item;
            }),

    // Record a transfer (buy/sell)
    recordTransfer: publicProcedure
      .input(
              z.object({
                        item_id: z.string(),
                        from_wallet: z.string(),
                        to_wallet: z.string(),
                        tx_hash: z.string(),
                        price_usdc: z.number(),
                      })
            )
      .mutation(async ({ input }) => {
              const supabase = await createClient();

              // Update current owner
              const { error: updateError } = await supabase
                .from('items')
                .update({
                            current_owner_wallet: input.to_wallet,
                            is_listed: false,
                            price_usdc: null,
                          })
                .eq('id', input.item_id);

              if (updateError) throw new Error(updateError.message);

              // Increment transfer count
              const { data: currentItem } = await supabase
                .from('items')
                .select('transfer_count')
                .eq('id', input.item_id)
                .single();

              await supabase
                .from('items')
                .update({ transfer_count: (currentItem?.transfer_count ?? 0) + 1 })
                .eq('id', input.item_id);

              // Record history
              await supabase.from('ownership_history').insert({
                        item_id: input.item_id,
                        owner_wallet: input.to_wallet,
                        from_wallet: input.from_wallet,
                        tx_hash: input.tx_hash,
                        event_type: 'transfer',
                        price_usdc: input.price_usdc,
                      });

              return { success: true };
            }),
  });
