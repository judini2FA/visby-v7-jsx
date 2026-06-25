import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';

export const blocksRouter = createTRPCRouter({
  status: publicProcedure
    .input(z.object({ viewer: z.string(), other: z.string() }))
    .query(async ({ input }): Promise<{ i_blocked: boolean; blocked_me: boolean }> => {
      try {
        const supabase = createServiceClient();
        const [iBlocked, blockedMe] = await Promise.all([
          supabase
            .from('blocks')
            .select('id')
            .eq('blocker_wallet', input.viewer)
            .eq('blocked_wallet', input.other)
            .maybeSingle(),
          supabase
            .from('blocks')
            .select('id')
            .eq('blocker_wallet', input.other)
            .eq('blocked_wallet', input.viewer)
            .maybeSingle(),
        ]);
        return {
          i_blocked: !!iBlocked.data,
          blocked_me: !!blockedMe.data,
        };
      } catch {
        return { i_blocked: false, blocked_me: false };
      }
    }),
});
