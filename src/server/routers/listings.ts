import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';
import { expandSearchTerms, sanitizeIlikeTerm } from '@/server/lib/synonyms';
import { searchListings } from '@/server/lib/search-engine';

export const listingsRouter = createTRPCRouter({
  getBySerial: publicProcedure
    .input(z.object({ serial: z.string() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('items')
        .select('*, ownership_history(*)')
        .eq('serial_number', input.serial)
        .order('created_at', { referencedTable: 'ownership_history', ascending: true })
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  listForSale: publicProcedure
    .input(z.object({
      serial: z.string(),
      price_usdc: z.number().positive(),
      seller_wallet: z.string(),
    }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('items')
        .update({ is_listed: true, price_usdc: input.price_usdc, listed_at: new Date().toISOString() })
        .eq('serial_number', input.serial)
        .eq('current_owner_wallet', input.seller_wallet)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  unlist: publicProcedure
    .input(z.object({ serial: z.string(), seller_wallet: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('items')
        .update({ is_listed: false, price_usdc: null, listed_at: null })
        .eq('serial_number', input.serial)
        .eq('current_owner_wallet', input.seller_wallet)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  // Listed items for marketplace — server-side category + price bounds
  getListings: publicProcedure
    .input(z.object({
      category:  z.string().optional(),
      condition: z.string().optional(),
      minPrice:  z.number().optional(),
      maxPrice:  z.number().optional(),
      sort:      z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
      limit:     z.number().default(40),
      search:    z.string().optional(),
    }))
    .query(async ({ input }) => {
      // Intuitive text search → in-app Orama engine (typo tolerance, BM25 relevance,
      // synonyms). Falls back to SQL ilike + synonym expansion if anything throws.
      if (input.search) {
        try {
          return await searchListings({
            query: input.search,
            category: input.category,
            condition: input.condition,
            minPrice: input.minPrice,
            maxPrice: input.maxPrice,
            sort: input.sort,
            limit: input.limit,
          });
        } catch {
          // fall through to the SQL path below
        }
      }

      const supabase = createServiceClient();
      let q = supabase.from('items').select('*').eq('is_listed', true);
      if (input.search) {
        // Fallback: expand "navy" → navy/dark blue/midnight blue/… via SQL ilike.
        const terms = await expandSearchTerms(input.search);
        const ors = terms
          .map(sanitizeIlikeTerm)
          .filter(Boolean)
          .flatMap((t) => [`name.ilike.%${t}%`, `category.ilike.%${t}%`, `description.ilike.%${t}%`]);
        if (ors.length) q = q.or(ors.join(','));
      }
      if (input.category)  q = q.eq('category', input.category);
      if (input.condition) q = q.eq('condition', input.condition);
      if (input.minPrice != null) q = q.gte('price_usdc', input.minPrice);
      if (input.maxPrice != null) q = q.lte('price_usdc', input.maxPrice);
      if (input.sort === 'price_asc')  q = q.order('price_usdc', { ascending: true });
      else if (input.sort === 'price_desc') q = q.order('price_usdc', { ascending: false });
      else q = q.order('listed_at', { ascending: false });
      q = q.limit(input.limit);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  // All items owned by a wallet (listed or not)
  getByOwner: publicProcedure
    .input(z.object({ wallet: z.string(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('current_owner_wallet', input.wallet)
        .order('created_at', { ascending: false })
        .limit(input.limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  // Sales made BY a wallet — ownership_history where from_wallet = wallet
  getSoldByWallet: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('ownership_history')
        .select('*, items(*)')
        .eq('from_wallet', input.wallet)
        .eq('event_type', 'transfer')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  // Purchases made BY a wallet — ownership_history where owner_wallet = wallet
  getPurchasesByWallet: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('ownership_history')
        .select('*, items(*)')
        .eq('owner_wallet', input.wallet)
        .eq('event_type', 'transfer')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
});
