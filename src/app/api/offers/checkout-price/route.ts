import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveCheckoutPrice } from '@/lib/offers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// The checkout modal calls this to learn the effective price for the AUTHENTICATED buyer (accepted-offer
// price if one applies, else the list price) — the SAME number resolveCheckoutPrice hands every rail. This
// is display/quote convenience only; the server rails independently re-resolve and enforce the price, so a
// tampered response here can't change what the buyer is actually charged. Fails soft to the item list price.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const item_id = typeof body?.item_id === 'string' ? body.item_id : '';
  const buyer_wallet = typeof body?.buyer_wallet === 'string' ? body.buyer_wallet : '';
  if (!item_id || !buyer_wallet) return NextResponse.json({ error: 'item_id and buyer_wallet required' }, { status: 400 });
  if (!ctx.wallets.includes(buyer_wallet)) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });

  const supabase = createServiceClient();
  const { data: item } = await supabase.from('items').select('id, price_usdc, is_listed').eq('id', item_id).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const { priceUsd, offerId } = await resolveCheckoutPrice(item, buyer_wallet);
  const listPrice = Number(item.price_usdc ?? 0);
  return NextResponse.json({ priceUsd, offerId, listPrice, hasOffer: offerId != null && priceUsd < listPrice });
}
