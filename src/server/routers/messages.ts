import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';

export const messagesRouter = createTRPCRouter({
  send: publicProcedure
    .input(z.object({
      from_wallet: z.string(),
      to_wallet: z.string(),
      content: z.string().min(1).max(1000),
      item_id: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('messages')
        .insert({
          from_wallet: input.from_wallet,
          to_wallet: input.to_wallet,
          content: input.content,
          item_id: input.item_id ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  getConversations: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      if (!input.wallet) return [];
      const supabase = createServiceClient();
      const { data: sent } = await supabase
        .from('messages')
        .select('from_wallet, to_wallet, content, created_at, read')
        .eq('from_wallet', input.wallet)
        .order('created_at', { ascending: false });
      const { data: received } = await supabase
        .from('messages')
        .select('from_wallet, to_wallet, content, created_at, read')
        .eq('to_wallet', input.wallet)
        .order('created_at', { ascending: false });

      const all = [...(sent ?? []), ...(received ?? [])];
      const convMap: Record<string, { partner_wallet: string; last_message: string; last_at: string; unread: number }> = {};
      for (const msg of all) {
        const partner = msg.from_wallet === input.wallet ? msg.to_wallet : msg.from_wallet;
        const existing = convMap[partner];
        if (!existing || new Date(msg.created_at) > new Date(existing.last_at)) {
          convMap[partner] = {
            partner_wallet: partner,
            last_message: msg.content,
            last_at: msg.created_at,
            unread: 0,
          };
        }
        if (msg.to_wallet === input.wallet && !msg.read) {
          convMap[partner] = { ...convMap[partner], unread: (convMap[partner]?.unread ?? 0) + 1 };
        }
      }

      const convList = Object.values(convMap).sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
      if (!convList.length) return [];

      const partnerWallets = convList.map(c => c.partner_wallet);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('wallet, display_name')
        .in('wallet', partnerWallets);
      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.wallet, p.display_name]));

      return convList.map(c => ({
        ...c,
        partner_name: profileMap[c.partner_wallet] ?? null,
      }));
    }),

  getThread: publicProcedure
    .input(z.object({ wallet_a: z.string(), wallet_b: z.string() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(from_wallet.eq.${input.wallet_a},to_wallet.eq.${input.wallet_b}),and(from_wallet.eq.${input.wallet_b},to_wallet.eq.${input.wallet_a})`
        )
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  markRead: publicProcedure
    .input(z.object({ from_wallet: z.string(), to_wallet: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient();
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('from_wallet', input.from_wallet)
        .eq('to_wallet', input.to_wallet)
        .eq('read', false);
      return { ok: true };
    }),
});
