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
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          wallet:             input.wallet,
          display_name:       input.display_name ?? null,
          bio:                input.bio ?? null,
          preferred_currency: input.preferred_currency ?? null,
          updated_at:         new Date().toISOString(),
        }, { onConflict: 'wallet' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),
});
