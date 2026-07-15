import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

function missingSchema(error: any): boolean {
  const code = error?.code;
  if (code === '42P01' || code === 'PGRST205') return true;
  return typeof error?.message === 'string' && error.message.includes('does not exist');
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const supabase = createServiceClient();
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
