import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Blueprint 6.6 — chargeback evidence bundle. Compiles everything an issuer would want to see to
// defend a card chargeback on one order: the transaction, the delivery proof (carrier/tracking/dates),
// the on-chain provenance trail (the item's NFT + its mint/transfer history — proof the authentic item
// changed hands to the buyer), and any dispute evidence the parties uploaded (6.5). Admin-only.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');
  const wallet = searchParams.get('wallet');
  if (!orderId || !wallet) return NextResponse.json({ error: 'order_id and wallet are required' }, { status: 400 });

  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdminRole(wallet, 'finance')) && !(await isAdminRole(wallet, 'moderator'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, item_id, buyer_wallet, seller_wallet, price_usdc, platform_fee_usd, seller_net_usd, pay_method, sale_channel, status, ship_name, ship_address, tracking_carrier, tracking_number, shipping_service, shipped_at, delivered_at, stripe_payment_intent, created_at')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) return NextResponse.json({ error: 'Could not load order' }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Item + on-chain identity.
  const { data: item } = await supabase
    .from('items')
    .select('id, name, serial_number, nft_mint_address, brand')
    .eq('id', order.item_id)
    .maybeSingle();

  // Provenance trail — the chain-verified mint + transfer history for this item.
  const { data: provenance } = await supabase
    .from('ownership_history')
    .select('event_type, from_wallet, owner_wallet, tx_hash, price_usdc, created_at')
    .eq('item_id', order.item_id)
    .order('created_at', { ascending: true });

  // Dispute (if any) + its uploaded evidence.
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id, kind, reason, status, resolution_note, refund_amount_usd, created_at, resolved_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .maybeSingle();

  let evidence: any[] = [];
  if (dispute?.id) {
    const { data: ev } = await supabase
      .from('dispute_evidence')
      .select('role, file_url, file_type, note, created_at')
      .eq('dispute_id', dispute.id)
      .order('created_at', { ascending: true });
    evidence = ev ?? [];
  }

  return NextResponse.json({
    order: {
      id: order.id,
      created_at: order.created_at,
      pay_method: order.pay_method,
      sale_channel: order.sale_channel ?? null,
      stripe_payment_intent: order.stripe_payment_intent ?? null,
      price_usdc: order.price_usdc,
      platform_fee_usd: order.platform_fee_usd ?? null,
      seller_net_usd: order.seller_net_usd ?? null,
      status: order.status,
      buyer_wallet: order.buyer_wallet,
      seller_wallet: order.seller_wallet,
    },
    item: item
      ? { name: item.name, brand: item.brand ?? null, serial_number: item.serial_number, nft_mint_address: item.nft_mint_address }
      : null,
    shipping: {
      ship_name: order.ship_name ?? null,
      ship_address: order.ship_address ?? null,
      carrier: order.tracking_carrier ?? null,
      tracking_number: order.tracking_number ?? null,
      service: order.shipping_service ?? null,
      shipped_at: order.shipped_at ?? null,
      delivered_at: order.delivered_at ?? null,
      delivered: order.status === 'delivered',
    },
    provenance: provenance ?? [],
    dispute: dispute ?? null,
    evidence,
    generated_at: new Date().toISOString(),
  });
}
