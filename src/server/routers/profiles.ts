import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';

export const profilesRouter = createTRPCRouter({
  // PUBLIC, unauthenticated read — project ONLY public columns. Never select('*') here: profiles also
  // holds ship_to (buyer home address), ship_from, connected_wallets / tally_wallet (cross-chain wallet
  // graph) and payment_order. Private fields are served by the authed /api/profile/private route.
  getProfile: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('profiles')
        .select('wallet, display_name, bio, avatar_url, preferred_currency')
        .eq('wallet', input.wallet)
        .single();
      return data ?? null;
    }),

  upsertProfile: protectedProcedure
    .input(z.object({
      wallet:             z.string(),
      display_name:       z.string().max(40).optional(),
      bio:                z.string().max(200).optional(),
      avatar_url:         z.string().max(1000).optional(),
      preferred_currency: z.string().max(10).optional(),
      connected_wallets:  z.array(z.object({
        id: z.string(), chain: z.enum(['solana', 'ethereum', 'bitcoin']), address: z.string().max(120), label: z.string().max(60).optional(),
      })).max(25).optional(),
      tally_wallet:       z.string().max(64).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.wallet)) throw new TRPCError({ code: 'FORBIDDEN' });
      const supabase = createServiceClient();
      // Only write the fields actually provided — a partial edit (e.g. just bio) must not
      // null out the others, nor touch columns it didn't intend to (e.g. preferred_currency).
      const patch: Record<string, unknown> = {
        wallet: input.wallet,
        updated_at: new Date().toISOString(),
      };
      if (input.display_name !== undefined) patch.display_name = input.display_name || null;
      if (input.bio !== undefined) patch.bio = input.bio || null;
      if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url || null;
      if (input.preferred_currency !== undefined) patch.preferred_currency = input.preferred_currency || null;
      if (input.connected_wallets !== undefined) patch.connected_wallets = input.connected_wallets;
      if (input.tally_wallet !== undefined) patch.tally_wallet = input.tally_wallet || null;

      // Columns that may not exist before their migration runs — strip + retry so the core fields
      // always save (migration_profile_avatar.sql, migration_connected_wallets.sql).
      const OPTIONAL_COLS = ['avatar_url', 'connected_wallets', 'tally_wallet'] as const;

      const { data, error } = await supabase
        .from('profiles')
        .upsert(patch, { onConflict: 'wallet' })
        .select()
        .single();
      if (error) {
        const missingCol = error.code === '42703' || error.code === 'PGRST204' || OPTIONAL_COLS.some(c => error.message?.includes(c));
        if (missingCol) {
          let didStrip = false;
          for (const col of OPTIONAL_COLS) {
            if (col in patch && (error.message?.includes(col) || error.code === '42703' || error.code === 'PGRST204')) {
              delete patch[col]; didStrip = true;
            }
          }
          if (didStrip) {
            const retry = await supabase.from('profiles').upsert(patch, { onConflict: 'wallet' }).select().single();
            if (retry.error) throw new Error(retry.error.message);
            return retry.data;
          }
        }
        throw new Error(error.message);
      }
      return data;
    }),

  // Search profiles by display name or wallet — feeds the home "Sellers" search.
  searchProfiles: publicProcedure
    .input(z.object({ query: z.string(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      // Strip characters that carry meaning in PostgREST .or()/ilike filters before interpolating.
      const q = input.query.trim().slice(0, 60).replace(/[%,()*\\]/g, ' ').trim();
      if (!q) return [];
      const supabase = createServiceClient();
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .or(`display_name.ilike.%${q}%,wallet.ilike.${q}%`)
        .limit(input.limit ?? 40);
      const rows = (profs ?? []) as any[];
      if (!rows.length) return [];

      const wallets = rows.map(p => p.wallet);
      const { data: items } = await supabase
        .from('items')
        .select('current_owner_wallet')
        .eq('is_listed', true)
        .in('current_owner_wallet', wallets);
      const counts: Record<string, number> = {};
      for (const it of items ?? []) {
        const w = (it as any).current_owner_wallet;
        if (w) counts[w] = (counts[w] ?? 0) + 1;
      }

      return rows
        .map(p => ({
          wallet: p.wallet as string,
          display_name: (p.display_name as string | null) ?? null,
          bio: (p.bio as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
          listing_count: counts[p.wallet] ?? 0,
        }))
        .sort((a, b) => b.listing_count - a.listing_count);
    }),
});
