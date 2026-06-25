import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';

const EMPTY_BREAKDOWN = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

function calcAvg(ratings: number[]): number {
  if (!ratings.length) return 0;
  const mean = ratings.reduce((s, r) => s + r, 0) / ratings.length;
  return Math.round(mean * 10) / 10;
}

export const reviewsRouter = createTRPCRouter({
  getReputation: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('reviews')
        .select('rating')
        .eq('seller_wallet', input.wallet);
      if (error) return { avg: 0, count: 0 };
      const ratings = (data ?? []).map(r => r.rating as number);
      return { avg: calcAvg(ratings), count: ratings.length };
    }),

  getBySeller: publicProcedure
    .input(z.object({ wallet: z.string(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      const limit = input.limit ?? 20;
      const supabase = createServiceClient();

      // Fetch all rows for breakdown + paginated slice for display
      const { data: allRows, error } = await supabase
        .from('reviews')
        .select('id, rating, comment, reviewer_wallet, item_id, created_at')
        .eq('seller_wallet', input.wallet)
        .order('created_at', { ascending: false });

      if (error) {
        return { avg: 0, count: 0, breakdown: { ...EMPTY_BREAKDOWN }, reviews: [] };
      }

      const rows = allRows ?? [];
      const ratings = rows.map(r => r.rating as number);
      const avg = calcAvg(ratings);
      const count = ratings.length;

      const breakdown = { ...EMPTY_BREAKDOWN };
      for (const r of ratings) {
        const key = String(r) as keyof typeof breakdown;
        if (key in breakdown) breakdown[key]++;
      }

      const page = rows.slice(0, limit);
      if (!page.length) {
        return { avg, count, breakdown, reviews: [] };
      }

      const reviewerWallets = [...new Set(page.map(r => r.reviewer_wallet as string))];
      const itemIds = [...new Set(page.map(r => r.item_id as string | null).filter(Boolean))] as string[];

      const [profilesRes, itemsRes] = await Promise.all([
        supabase.from('profiles').select('wallet, display_name').in('wallet', reviewerWallets),
        itemIds.length
          ? supabase.from('items').select('id, name').in('id', itemIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = Object.fromEntries(
        ((profilesRes.data ?? []) as { wallet: string; display_name: string | null }[]).map(p => [p.wallet, p.display_name])
      );
      const itemMap = Object.fromEntries(
        ((itemsRes.data ?? []) as { id: string; name: string | null }[]).map(i => [i.id, i.name])
      );

      const reviews = page.map(r => ({
        id: r.id as string,
        rating: r.rating as number,
        comment: (r.comment as string | null) ?? null,
        reviewer_wallet: r.reviewer_wallet as string,
        reviewer_name: profileMap[r.reviewer_wallet as string] ?? null,
        item_id: (r.item_id as string | null) ?? null,
        item_name: r.item_id ? (itemMap[r.item_id as string] ?? null) : null,
        created_at: r.created_at as string,
      }));

      return { avg, count, breakdown, reviews };
    }),

  getReputationBatch: publicProcedure
    .input(z.object({ wallets: z.array(z.string()) }))
    .query(async ({ input }) => {
      if (!input.wallets.length) return {} as Record<string, { avg: number; count: number }>;
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('reviews')
        .select('seller_wallet, rating')
        .in('seller_wallet', input.wallets);
      if (error) return {} as Record<string, { avg: number; count: number }>;

      const grouped: Record<string, number[]> = {};
      for (const row of data ?? []) {
        const w = row.seller_wallet as string;
        if (!grouped[w]) grouped[w] = [];
        grouped[w].push(row.rating as number);
      }

      const result: Record<string, { avg: number; count: number }> = {};
      for (const w of input.wallets) {
        const ratings = grouped[w] ?? [];
        result[w] = { avg: calcAvg(ratings), count: ratings.length };
      }
      return result;
    }),
});
