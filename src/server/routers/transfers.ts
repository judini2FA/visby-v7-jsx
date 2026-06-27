import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveRecipient } from '@/lib/transfers';

export const transfersRouter = createTRPCRouter({
  // Live recipient lookup for the "Send to Someone" field — by wallet address or Visby handle.
  resolve: protectedProcedure
    .input(z.object({ to: z.string().min(1).max(60) }))
    .query(async ({ input }) => {
      return await resolveRecipient(input.to);
    }),

  // The caller's own send/receive ledger (both directions), newest first.
  history: protectedProcedure
    .input(z.object({ wallet: z.string(), limit: z.number().max(100).default(40) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.wallet)) throw new TRPCError({ code: 'FORBIDDEN' });
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .or(`from_wallet.eq.${input.wallet},to_wallet.eq.${input.wallet}`)
        .order('created_at', { ascending: false })
        .limit(input.limit);
      if (error) return [];
      return (data ?? []).map((r: any) => ({ ...r, direction: r.from_wallet === input.wallet ? 'out' : 'in' }));
    }),
});
