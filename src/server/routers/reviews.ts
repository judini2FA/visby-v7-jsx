import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications';
import { friendlyError } from '@/lib/friendly-error';

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

  // In-app rating path (Phase SH4) — parallel to the emailed-token flow in /api/reviews +
  // src/app/review/[token]/page.tsx. Both write the same `reviews` row shape so profile/seller
  // aggregation (getReputation, getBySeller) keeps counting exactly one review per order either way.
  // Unlike the token route's upsert (which lets a buyer revisit their emailed link and revise), this
  // path is a first-time in-app rating prompt, so a second call is rejected with CONFLICT rather than
  // silently overwriting — matches the "already rated" state the client renders instead of a form.
  createForOrder: protectedProcedure
    .input(z.object({
      orderId: z.string(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const supabase = createServiceClient();

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('id, item_id, buyer_wallet, seller_wallet, status')
        .eq('id', input.orderId)
        .single();
      if (orderErr || !order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });

      // Reviewer identity comes from ctx.wallets (the caller's own verified wallets), never from
      // client input — the buyer can't be spoofed by passing someone else's wallet in the payload.
      if (!ctx.wallets.includes(order.buyer_wallet)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the buyer can review this order' });
      }
      if (order.status !== 'delivered') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You can review once the order is delivered' });
      }

      // Dedupe key: (order_id, reviewer_wallet) — the table's UNIQUE constraint (migration_reviews.sql)
      // and the same pair the token flow upserts on, so a buyer can never end up with two rows for one
      // order regardless of which path they rate through.
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('order_id', input.orderId)
        .eq('reviewer_wallet', order.buyer_wallet)
        .maybeSingle();
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'You already reviewed this order' });

      const comment = input.comment?.trim().slice(0, 2000) || null;

      const { data: review, error: insertErr } = await supabase
        .from('reviews')
        .insert({
          order_id: input.orderId,
          item_id: order.item_id,
          reviewer_wallet: order.buyer_wallet,
          seller_wallet: order.seller_wallet,
          rating: input.rating,
          comment,
        })
        .select()
        .single();

      if (insertErr) {
        // 23505 = unique_violation — a race against a concurrent submit (e.g. two tabs) loses here
        // instead of erroring generically.
        if (insertErr.code === '23505') throw new TRPCError({ code: 'CONFLICT', message: 'You already reviewed this order' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: friendlyError(insertErr, 'Could not submit your review — try again.') });
      }

      await notify({
        recipient_wallet: order.seller_wallet,
        type: 'review',
        title: 'New review',
        body: `You received a ${input.rating}-star review.`,
        link: '/dashboard',
        data: { rating: input.rating },
      });

      return review;
    }),

  // Lets the order page show "already rated" (with the existing rating/comment) instead of the form.
  // Either party on the order may read it; only the buyer can ever have written it.
  getForOrder: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input, ctx }) => {
      const supabase = createServiceClient();
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('buyer_wallet, seller_wallet')
        .eq('id', input.orderId)
        .single();
      if (orderErr || !order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      if (!ctx.wallets.includes(order.buyer_wallet) && !ctx.wallets.includes(order.seller_wallet)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const { data: review } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at')
        .eq('order_id', input.orderId)
        .eq('reviewer_wallet', order.buyer_wallet)
        .maybeSingle();
      return review ?? null;
    }),
});
