import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';
import { friendlyError } from '@/lib/friendly-error';

export const likesRouter = createTRPCRouter({
  toggle: publicProcedure
    .input(z.object({ item_id: z.string(), wallet: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient();
      const { data: existing } = await supabase
        .from('likes')
        .select('id')
        .eq('item_id', input.item_id)
        .eq('wallet', input.wallet)
        .maybeSingle();

      if (existing) {
        await supabase.from('likes').delete().eq('id', existing.id);
      } else {
        await supabase.from('likes').insert({ item_id: input.item_id, wallet: input.wallet });
      }

      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', input.item_id);

      return { liked: !existing, count: count ?? 0 };
    }),

  getByItem: publicProcedure
    .input(z.object({ item_id: z.string(), viewer_wallet: z.string().optional() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', input.item_id);

      let likedByViewer = false;
      if (input.viewer_wallet) {
        const { data } = await supabase
          .from('likes')
          .select('id')
          .eq('item_id', input.item_id)
          .eq('wallet', input.viewer_wallet)
          .maybeSingle();
        likedByViewer = !!data;
      }

      return { count: count ?? 0, liked: likedByViewer };
    }),

  getLikedByWallet: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      if (!input.wallet) return [];
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('likes')
        .select('item_id, created_at, items(*)')
        .eq('wallet', input.wallet)
        .order('created_at', { ascending: false });
      if (error) throw new Error(friendlyError(error, 'Could not load — try again.'));
      return (data ?? []).map(r => ({ ...(r.items as any), liked_at: r.created_at }));
    }),

  getForOwner: publicProcedure
    .input(z.object({ owner_wallet: z.string() }))
    .query(async ({ input }) => {
      if (!input.owner_wallet) return [];
      const supabase = createServiceClient();
      const { data: ownedItems } = await supabase
        .from('items')
        .select('id, name')
        .eq('current_owner_wallet', input.owner_wallet);
      if (!ownedItems?.length) return [];

      const itemIds = ownedItems.map(i => i.id);
      const { data, error } = await supabase
        .from('likes')
        .select('item_id, wallet, created_at')
        .in('item_id', itemIds)
        .order('created_at', { ascending: false });
      if (error) throw new Error(friendlyError(error, 'Could not load — try again.'));

      const nameMap = Object.fromEntries(ownedItems.map(i => [i.id, i.name]));
      const grouped: Record<string, { item_id: string; item_name: string; count: number; latest_at: string }> = {};
      for (const like of data ?? []) {
        if (!grouped[like.item_id]) {
          grouped[like.item_id] = { item_id: like.item_id, item_name: nameMap[like.item_id] ?? 'Item', count: 0, latest_at: like.created_at };
        }
        grouped[like.item_id].count++;
      }
      return Object.values(grouped).sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
    }),
});
