import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';
import { expandSearchTerms, sanitizeIlikeTerm } from '@/server/lib/synonyms';
import { searchListings } from '@/server/lib/search-engine';
import { ownersForItems } from '@/lib/owners';
import { requireKycForSale } from '@/lib/kyc';

// Hide listings owned by flagged sellers from public browse. Degrades to "hide nothing" if the
// is_flagged column isn't migrated yet, so the marketplace never breaks on a missing column.
async function dropFlaggedOwners(supabase: ReturnType<typeof createServiceClient>, items: any[]): Promise<any[]> {
  if (!items.length) return items;
  const wallets = [...new Set(items.map((i) => i.current_owner_wallet).filter(Boolean))];
  if (!wallets.length) return items;
  const { data, error } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('is_flagged', true)
    .in('wallet', wallets);
  if (error) return items;
  const flagged = new Set((data ?? []).map((r: any) => r.wallet));
  return flagged.size ? items.filter((i) => !flagged.has(i.current_owner_wallet)) : items;
}

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

  listForSale: protectedProcedure
    .input(z.object({
      serial: z.string(),
      price_usdc: z.number().positive(),
      seller_wallet: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.seller_wallet)) throw new TRPCError({ code: 'FORBIDDEN' });
      // Gate listing behind ID verification (no-op until NEXT_PUBLIC_KYC_REQUIRED=1).
      const kyc = await requireKycForSale(input.seller_wallet);
      if (!kyc.ok) throw new TRPCError({ code: 'FORBIDDEN', message: 'kyc_required' });
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

  unlist: protectedProcedure
    .input(z.object({ serial: z.string(), seller_wallet: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.seller_wallet)) throw new TRPCError({ code: 'FORBIDDEN' });
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
      sort:      z.enum(['newest', 'price_asc', 'price_desc', 'popular']).default('newest'),
      limit:     z.number().default(40),
      search:    z.string().optional(),
    }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      // Attach the ordered owner chain (avatars) used by the thumbnail's owner stack.
      const withOwners = async (items: any[]) => {
        const visible = await dropFlaggedOwners(supabase, items);
        const owners = await ownersForItems(supabase, visible);
        for (const it of visible) it.owners = owners[it.id] ?? [];
        return visible;
      };

      // Intuitive text search → in-app Orama engine (typo tolerance, BM25 relevance,
      // synonyms). Falls back to SQL ilike + synonym expansion if anything throws.
      if (input.search) {
        try {
          return await withOwners(await searchListings({
            query: input.search,
            category: input.category,
            condition: input.condition,
            minPrice: input.minPrice,
            maxPrice: input.maxPrice,
            sort: input.sort,
            limit: input.limit,
          }));
        } catch {
          // fall through to the SQL path below
        }
      }

      let searchOrs: string[] = [];
      if (input.search) {
        // Fallback: expand "navy" → navy/dark blue/midnight blue/… via SQL ilike.
        const terms = await expandSearchTerms(input.search);
        searchOrs = terms
          .map(sanitizeIlikeTerm)
          .filter(Boolean)
          .flatMap((t) => [`name.ilike.%${t}%`, `category.ilike.%${t}%`, `description.ilike.%${t}%`]);
      }
      const buildFiltered = () => {
        let q = supabase.from('items').select('*').eq('is_listed', true);
        if (searchOrs.length) q = q.or(searchOrs.join(','));
        if (input.category)  q = q.eq('category', input.category);
        if (input.condition) q = q.eq('condition', input.condition);
        if (input.minPrice != null) q = q.gte('price_usdc', input.minPrice);
        if (input.maxPrice != null) q = q.lte('price_usdc', input.maxPrice);
        return q;
      };

      let q = buildFiltered();
      if (input.sort === 'price_asc')  q = q.order('price_usdc', { ascending: true });
      else if (input.sort === 'price_desc') q = q.order('price_usdc', { ascending: false });
      else if (input.sort === 'popular') q = q.order('view_count', { ascending: false }).order('listed_at', { ascending: false });
      else q = q.order('listed_at', { ascending: false });
      q = q.limit(input.limit);

      let { data, error } = await q;
      // 'popular' orders by items.view_count, which doesn't exist until migration_analytics runs.
      // Degrade to newest rather than 500 the whole marketplace.
      if (error && input.sort === 'popular' && (error.code === '42703' || error.message?.includes('does not exist'))) {
        ({ data, error } = await buildFiltered().order('listed_at', { ascending: false }).limit(input.limit));
      }
      if (error) throw new Error(error.message);
      return await withOwners(data ?? []);
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
      const items = data ?? [];
      const owners = await ownersForItems(supabase, items);   // owners[0] = original seller, for the Tally card
      for (const it of items) (it as any).owners = owners[it.id] ?? [];
      return items;
    }),

  // Tallys held across several connected wallets — aggregates the "My Tallys" view.
  getByOwnerBatch: publicProcedure
    .input(z.object({ wallets: z.array(z.string()).max(25), limit: z.number().default(120) }))
    .query(async ({ input }) => {
      const wallets = [...new Set(input.wallets.filter(Boolean))];
      if (!wallets.length) return [];
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .in('current_owner_wallet', wallets)
        .order('created_at', { ascending: false })
        .limit(input.limit);
      if (error) throw new Error(error.message);
      const items = data ?? [];
      const owners = await ownersForItems(supabase, items);
      for (const it of items) (it as any).owners = owners[it.id] ?? [];
      return items;
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
