import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';

export const followsRouter = createTRPCRouter({
  follow: publicProcedure
    .input(z.object({ follower_wallet: z.string(), following_wallet: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from('follows')
        .upsert(
          { follower_wallet: input.follower_wallet, following_wallet: input.following_wallet },
          { onConflict: 'follower_wallet,following_wallet', ignoreDuplicates: true }
        );
      if (error) throw new Error(error.message);
      return { following: true };
    }),

  unfollow: publicProcedure
    .input(z.object({ follower_wallet: z.string(), following_wallet: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_wallet', input.follower_wallet)
        .eq('following_wallet', input.following_wallet);
      if (error) throw new Error(error.message);
      return { following: false };
    }),

  isFollowing: publicProcedure
    .input(z.object({ follower_wallet: z.string(), following_wallet: z.string() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_wallet', input.follower_wallet)
        .eq('following_wallet', input.following_wallet)
        .maybeSingle();
      return { following: !!data };
    }),

  getFollowing: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      if (!input.wallet) return [];
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('follows')
        .select('following_wallet, created_at')
        .eq('follower_wallet', input.wallet)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      if (!data?.length) return [];

      const wallets = data.map(r => r.following_wallet);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('wallet, display_name')
        .in('wallet', wallets);

      const { data: latestListings } = await supabase
        .from('items')
        .select('current_owner_wallet, listed_at')
        .in('current_owner_wallet', wallets)
        .eq('is_listed', true)
        .order('listed_at', { ascending: false });

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.wallet, p.display_name]));
      const latestMap: Record<string, string | null> = {};
      for (const row of latestListings ?? []) {
        if (!latestMap[row.current_owner_wallet]) {
          latestMap[row.current_owner_wallet] = row.listed_at;
        }
      }

      return data.map(r => ({
        wallet: r.following_wallet,
        display_name: profileMap[r.following_wallet] ?? null,
        followed_at: r.created_at,
        latest_listing_at: latestMap[r.following_wallet] ?? null,
      }));
    }),
});
