import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';

export const messagesRouter = createTRPCRouter({
  // NOTE: send + markRead live as authed REST routes (/api/messages/send, /api/messages/read). These
  // reads are protectedProcedure: the caller must hold a Privy token controlling the wallet whose private
  // conversations they're reading — otherwise any wallet's DMs would be enumerable (IDOR).
  getConversations: protectedProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.wallet)) throw new TRPCError({ code: 'FORBIDDEN' });
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
        // Update last_message/last_at without resetting the accumulated unread count.
        if (!existing || new Date(msg.created_at) > new Date(existing.last_at)) {
          convMap[partner] = {
            partner_wallet: partner,
            last_message: msg.content,
            last_at: msg.created_at,
            unread: existing?.unread ?? 0,
          };
        }
        if (msg.to_wallet === input.wallet && !msg.read) {
          convMap[partner].unread += 1;
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

  getThread: protectedProcedure
    .input(z.object({ wallet_a: z.string(), wallet_b: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.wallet_a) && !ctx.wallets.includes(input.wallet_b)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
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
});
