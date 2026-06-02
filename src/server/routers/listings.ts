import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createClient } from '@/lib/supabase/server';

export const listingsRouter = createTRPCRouter({
    // Get a listing by serial number
    getBySerial: publicProcedure
      .input(z.object({ serial: z.string() }))
      .query(async ({ input }) => {
              const supabase = await createClient();
              const { data, error } = await supabase
                .from('items')
                .select('*, ownership_history(*)')
                .eq('serial_number', input.serial)
                .single();

              if (error) throw new Error(error.message);
              return data;
            }),

    // List an item for sale
    listForSale: publicProcedure
      .input(
              z.object({
                        serial: z.string(),
                        price_usdc: z.number().positive(),
                        seller_wallet: z.string(),
                      })
            )
      .mutation(async ({ input }) => {
              const supabase = await createClient();
              const { data, error } = await supabase
                .from('items')
                .update({
                            is_listed: true,
                            price_usdc: input.price_usdc,
                            listed_at: new Date().toISOString(),
                          })
                .eq('serial_number', input.serial)
                .eq('current_owner_wallet', input.seller_wallet)
                .select()
                .single();

              if (error) throw new Error(error.message);
              return data;
            }),

    // Get all listed items
    getListings: publicProcedure
      .input(
              z.object({
                        category: z.string().optional(),
                        limit: z.number().default(20),
                      })
            )
      .query(async ({ input }) => {
              const supabase = await createClient();
              let query = supabase
                .from('items')
                .select('*')
                .eq('is_listed', true)
                .order('listed_at', { ascending: false })
                .limit(input.limit);

              if (input.category) {
                        query = query.eq('category', input.category);
                      }

              const { data, error } = await query;
              if (error) throw new Error(error.message);
              return data ?? [];
            }),
  });
