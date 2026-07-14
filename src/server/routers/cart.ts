import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';
import { friendlyError } from '@/lib/friendly-error';

// migration_cart.sql may not be applied yet — treat an absent `cart_items` table as empty/no-op
// rather than a 500, matching the tableMissing() convention used across the API routes.
function schemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || !!error.message?.includes('does not exist'));
}

// The cart is per-ACCOUNT, not per-wallet: it's keyed off the deterministic first wallet in the
// Privy-authed set (getAuthedContext sorts wallets so `wallets[0]` is stable across requests/devices),
// never a client-supplied address. This is what makes "wallet from ctx, never trust body" true here —
// no procedure below accepts a wallet in its input.
function acctWallet(wallets: string[]): string {
  const w = wallets[0];
  if (!w) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return w;
}

export interface CartItem {
  id: string;
  item_id: string;
  added_at: string;
  item: {
    id: string;
    name: string;
    price_usdc: number | null;
    image_url: string | null;
    current_owner_wallet: string;
  };
}

export const cartRouter = createTRPCRouter({
  // Cart rows joined against their item. Only rows whose item is still listed/active are returned;
  // anything else (unlisted, sold, deleted) is pruned from the cart as a side effect of reading it.
  list: protectedProcedure.query(async ({ ctx }): Promise<CartItem[]> => {
    const wallet = acctWallet(ctx.wallets);
    const supabase = createServiceClient();
    try {
      const { data: rows, error } = await supabase
        .from('cart_items')
        .select('id, item_id, created_at')
        .eq('wallet', wallet)
        .order('created_at', { ascending: false });
      if (error) {
        if (schemaMissing(error)) return [];
        throw new Error(friendlyError(error, 'Could not load your cart — try again.'));
      }
      if (!rows?.length) return [];

      const itemIds = rows.map((r) => r.item_id);
      const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('id, name, price_usdc, image_url, is_listed, current_owner_wallet')
        .in('id', itemIds);
      if (itemsError) throw new Error(friendlyError(itemsError, 'Could not load your cart — try again.'));

      const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
      const dead: string[] = [];
      const live: CartItem[] = [];
      for (const r of rows) {
        const item = itemMap.get(r.item_id);
        if (!item || !item.is_listed) { dead.push(r.item_id); continue; }
        live.push({
          id: r.id,
          item_id: r.item_id,
          added_at: r.created_at,
          item: {
            id: item.id,
            name: item.name,
            price_usdc: item.price_usdc,
            image_url: item.image_url,
            current_owner_wallet: item.current_owner_wallet,
          },
        });
      }

      // Auto-prune dead rows (unlisted/sold/deleted items) so the cart never shows stale entries and
      // never gets stuck at a false "in cart" state for an item that's no longer buyable.
      if (dead.length) {
        await supabase.from('cart_items').delete().eq('wallet', wallet).in('item_id', dead);
      }

      return live;
    } catch (e) {
      if (e instanceof TRPCError) throw e;
      return [];
    }
  }),

  // Raw row count for the cart badge — intentionally NOT joined against items (cheap, single query).
  // A stale entry inflates the badge by at most one until the next `list` call prunes it.
  count: protectedProcedure.query(async ({ ctx }): Promise<number> => {
    const wallet = acctWallet(ctx.wallets);
    const supabase = createServiceClient();
    try {
      const { count, error } = await supabase
        .from('cart_items')
        .select('id', { count: 'exact', head: true })
        .eq('wallet', wallet);
      if (error) {
        if (schemaMissing(error)) return 0;
        return 0;
      }
      return count ?? 0;
    } catch {
      return 0;
    }
  }),

  add: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }): Promise<{ ok: boolean }> => {
      const wallet = acctWallet(ctx.wallets);
      const supabase = createServiceClient();

      const { data: item, error: itemError } = await supabase
        .from('items')
        .select('id, current_owner_wallet, is_listed')
        .eq('id', input.itemId)
        .maybeSingle();
      if (itemError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: friendlyError(itemError, 'Could not add to cart — try again.') });
      if (!item || !item.is_listed) throw new TRPCError({ code: 'NOT_FOUND', message: 'item_not_listed' });
      if (ctx.wallets.includes(item.current_owner_wallet)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'own_item' });
      }

      const { error } = await supabase
        .from('cart_items')
        .upsert({ wallet, item_id: input.itemId }, { onConflict: 'wallet,item_id', ignoreDuplicates: true });
      if (error) {
        if (schemaMissing(error)) return { ok: true }; // fail-soft: migration not applied yet
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: friendlyError(error, 'Could not add to cart — try again.') });
      }
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input, ctx }): Promise<{ ok: boolean }> => {
      const wallet = acctWallet(ctx.wallets);
      const supabase = createServiceClient();
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('wallet', wallet)
        .eq('item_id', input.itemId);
      if (error && !schemaMissing(error)) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: friendlyError(error, 'Could not remove from cart — try again.') });
      }
      return { ok: true };
    }),

  clear: protectedProcedure.mutation(async ({ ctx }): Promise<{ ok: boolean }> => {
    const wallet = acctWallet(ctx.wallets);
    const supabase = createServiceClient();
    const { error } = await supabase.from('cart_items').delete().eq('wallet', wallet);
    if (error && !schemaMissing(error)) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: friendlyError(error, 'Could not clear cart — try again.') });
    }
    return { ok: true };
  }),
});
