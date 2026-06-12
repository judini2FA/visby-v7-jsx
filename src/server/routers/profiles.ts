import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';

export const profilesRouter = createTRPCRouter({
  getProfile: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet', input.wallet)
        .single();
      return data ?? null;
    }),

  upsertProfile: publicProcedure
    .input(z.object({
      wallet:             z.string(),
      display_name:       z.string().max(40).optional(),
      bio:                z.string().max(200).optional(),
      preferred_currency: z.string().max(10).optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient();
      // Only write the fields actually provided — a partial edit (e.g. just bio) must not
      // null out the others, nor touch columns it didn't intend to (e.g. preferred_currency).
      const patch: Record<string, unknown> = {
        wallet: input.wallet,
        updated_at: new Date().toISOString(),
      };
      if (input.display_name !== undefined) patch.display_name = input.display_name || null;
      if (input.bio !== undefined) patch.bio = input.bio || null;
      if (input.preferred_currency !== undefined) patch.preferred_currency = input.preferred_currency || null;

      const { data, error } = await supabase
        .from('profiles')
        .upsert(patch, { onConflict: 'wallet' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),
});
