import { createServiceClient } from '@/lib/supabase/service';

// Creates the physical-fulfillment order for a completed purchase. Additive and tolerant:
// if the orders table doesn't exist yet (migration not run) this is a silent no-op, and it
// dedupes so repeated settlement calls for the same item don't create duplicate orders.
export async function createOrder(o: {
  item_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  price_usdc: number | null;
  pay_method: string;
  nft_tx?: string | null;
}): Promise<void> {
  try {
    const supabase = createServiceClient();

    const { data: existing, error: checkErr } = await supabase
      .from('orders')
      .select('id')
      .eq('item_id', o.item_id)
      .neq('status', 'cancelled')
      .limit(1);
    if (checkErr) return;                 // table missing or unreachable — skip silently
    if (existing && existing.length) return;

    await supabase.from('orders').insert({
      item_id:       o.item_id,
      buyer_wallet:  o.buyer_wallet,
      seller_wallet: o.seller_wallet,
      price_usdc:    o.price_usdc,
      pay_method:    o.pay_method,
      status:        'paid',
      nft_tx:        o.nft_tx ?? null,
    });
  } catch {
    /* never let order bookkeeping break a settled purchase */
  }
}
