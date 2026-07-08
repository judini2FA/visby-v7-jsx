import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { listSellerOffers, listBuyerOffers, type Offer } from '@/lib/offers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// The offers UI. Returns the offers INCOMING to the caller (they are the seller) and the offers the caller
// MADE (they are the buyer), each enriched with the item's name/image/list price for display. Authed to the
// caller's own wallets — offers.ts already scopes queries to those wallets.
export async function GET(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [incoming, outgoing] = await Promise.all([
    listSellerOffers(ctx.wallets),
    listBuyerOffers(ctx.wallets),
  ]);

  const itemIds = Array.from(new Set([...incoming, ...outgoing].map((o) => o.item_id)));
  let itemMap: Record<string, { name: string; image_url: string | null; price_usdc: number | null; is_listed: boolean }> = {};
  if (itemIds.length) {
    try {
      const supabase = createServiceClient();
      const { data } = await supabase.from('items').select('id, name, image_url, price_usdc, is_listed').in('id', itemIds);
      for (const it of data ?? []) itemMap[it.id] = { name: it.name, image_url: it.image_url ?? null, price_usdc: it.price_usdc ?? null, is_listed: !!it.is_listed };
    } catch { /* item enrichment is best-effort; the offer rows still render */ }
  }

  const enrich = (o: Offer) => ({ ...o, item: itemMap[o.item_id] ?? null });
  return NextResponse.json({ incoming: incoming.map(enrich), outgoing: outgoing.map(enrich) });
}
