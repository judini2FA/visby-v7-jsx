import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

function missingSchema(error: any): boolean {
  const code = error?.code;
  if (code === '42P01' || code === 'PGRST205') return true;
  return typeof error?.message === 'string' && error.message.includes('does not exist');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const supabase = createServiceClient();

    // Cart: id is `cart_<orderId1>.<orderId2>...` — load all its orders and return a line-item bundle.
    if (id.startsWith('cart_')) {
      const ids = id.slice(5).split('.').filter(Boolean);
      if (!ids.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const { data: rows, error: cErr } = await supabase
        .from('sdk_orders')
        .select('id,product_name,serial_number,price_usdc,currency,status,image_url,merchant_id,merchant_net_usd,success_url, merchants(name)')
        .in('id', ids);
      if (cErr || !rows || rows.length !== ids.length) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const m = (rows[0] as any).merchants;
      const merchant_name = Array.isArray(m) ? m[0]?.name ?? null : m?.name ?? null;
      // Preserve the URL order (rows come back unordered).
      const byId = new Map(rows.map(r => [r.id, r]));
      const items = ids.map(i => byId.get(i)!).map(r => ({
        id: r.id, product_name: r.product_name, serial_number: r.serial_number,
        price_usdc: r.price_usdc, image_url: r.image_url,
      }));
      const total = rows.reduce((s, r) => s + Number(r.price_usdc), 0);
      const merchant_net = rows.reduce((s, r) => s + Number(r.merchant_net_usd ?? 0), 0);
      const allPending = rows.every(r => r.status === 'pending');
      return NextResponse.json({
        session: {
          id, cart: true, items, price_usdc: total, merchant_net_usd: merchant_net,
          currency: rows[0].currency, merchant_name, status: allPending ? 'pending' : 'settled',
          success_url: rows[0].success_url ?? null,
        },
      });
    }

    const { data, error } = await supabase
      .from('sdk_orders')
      .select(
        'id,product_name,serial_number,price_usdc,currency,status,success_url,cancel_url,image_url,merchant_id,merchant_net_usd, merchants(name)'
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      // Missing table degrades to a safe 404 rather than leaking a 500.
      if (missingSchema(error)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      console.error('[sdk/session]', error);
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const merchant = (data as any).merchants;
    const merchant_name = Array.isArray(merchant) ? merchant[0]?.name ?? null : merchant?.name ?? null;

    return NextResponse.json({
      session: {
        id: data.id,
        product_name: data.product_name,
        serial_number: data.serial_number,
        price_usdc: data.price_usdc,
        currency: data.currency,
        merchant_net_usd: data.merchant_net_usd,
        status: data.status,
        image_url: data.image_url,
        merchant_name,
        success_url: data.success_url,
        cancel_url: data.cancel_url,
      },
    });
  } catch (err: unknown) {
    console.error('[sdk/session]', err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
