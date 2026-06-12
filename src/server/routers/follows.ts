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

  // Sellers worth following — distinct owners of listed items, ranked by active listings,
  // excluding the viewer and anyone they already follow.
  getSuggested: publicProcedure
    .input(z.object({ wallet: z.string().optional() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();

      const { data: items } = await supabase
        .from('items')
        .select('current_owner_wallet')
        .eq('is_listed', true);
      if (!items?.length) return [];

      const counts: Record<string, number> = {};
      for (const it of items) {
        const w = it.current_owner_wallet;
        if (w) counts[w] = (counts[w] ?? 0) + 1;
      }

      if (input.wallet) {
        delete counts[input.wallet];
        const { data: following } = await supabase
          .from('follows')
          .select('following_wallet')
          .eq('follower_wallet', input.wallet);
        for (const f of following ?? []) delete counts[f.following_wallet];
      }

      const wallets = Object.keys(counts);
      if (!wallets.length) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('wallet, display_name, bio')
        .in('wallet', wallets);
      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.wallet, p]));

      return wallets
        .map(w => ({
          wallet: w,
          display_name: (profileMap[w]?.display_name as string | null) ?? null,
          bio: (profileMap[w]?.bio as string | null) ?? null,
          listing_count: counts[w],
        }))
        .sort((a, b) => b.listing_count - a.listing_count);
    }),

  // Follower / following counts for a wallet.
  getCounts: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      if (!input.wallet) return { followers: 0, following: 0 };
      const supabase = createServiceClient();
      const [followers, following] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_wallet', input.wallet),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_wallet', input.wallet),
      ]);
      return { followers: followers.count ?? 0, following: following.count ?? 0 };
    }),

  // A wallet's followers or following list, each marked with whether `viewer_wallet` follows them.
  getConnections: publicProcedure
    .input(z.object({
      wallet: z.string(),
      type: z.enum(['followers', 'following']),
      viewer_wallet: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (!input.wallet) return [];
      const supabase = createServiceClient();

      const matchCol = input.type === 'followers' ? 'following_wallet' : 'follower_wallet';
      const pickCol = input.type === 'followers' ? 'follower_wallet' : 'following_wallet';

      const { data: rows } = await supabase
        .from('follows')
        .select(`${pickCol}, created_at`)
        .eq(matchCol, input.wallet)
        .order('created_at', { ascending: false });
      if (!rows?.length) return [];

      const wallets = rows.map((r: any) => r[pickCol] as string);

      const { data: profiles } = await supabase
        .from('profiles').select('wallet, display_name, bio').in('wallet', wallets);
      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.wallet, p]));

      const { data: items } = await supabase
        .from('items').select('current_owner_wallet').eq('is_listed', true).in('current_owner_wallet', wallets);
      const counts: Record<string, number> = {};
      for (const it of items ?? []) counts[it.current_owner_wallet] = (counts[it.current_owner_wallet] ?? 0) + 1;

      let viewerSet = new Set<string>();
      if (input.viewer_wallet) {
        const { data: vf } = await supabase
          .from('follows').select('following_wallet').eq('follower_wallet', input.viewer_wallet);
        viewerSet = new Set((vf ?? []).map(r => r.following_wallet));
      }

      return wallets.map(w => ({
        wallet: w,
        display_name: (profileMap[w]?.display_name as string | null) ?? null,
        bio: (profileMap[w]?.bio as string | null) ?? null,
        listing_count: counts[w] ?? 0,
        viewer_following: viewerSet.has(w),
      }));
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
