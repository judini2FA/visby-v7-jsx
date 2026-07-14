import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchProfileMap } from '@/lib/owners';
import { friendlyError } from '@/lib/friendly-error';

export const dynamic = 'force-dynamic';

// Public read for a buyable pending (unminted) business serial — powers /business-item/[id]. Only
// rows that are actually purchasable are ever returned: status='pending' AND available=true AND
// price_usdc>0. Anything else (already minted, pulled by the business, unpriced draft) 404s so this
// endpoint can never leak unpublished or sold-out inventory to an unauthenticated buyer.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('pending_serials')
      .select('id, name, image_url, price_usdc, category, condition, description, brand, business_wallet, serial_number, status, available')
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    if (data.status !== 'pending' || !data.available || !(Number(data.price_usdc) > 0)) {
      return NextResponse.json({ error: 'This item is not available' }, { status: 404 });
    }

    const profiles = await fetchProfileMap(supabase, [data.business_wallet]);
    const seller = profiles[data.business_wallet] ?? null;

    return NextResponse.json({
      id: data.id,
      name: data.name,
      image_url: data.image_url,
      price_usdc: data.price_usdc,
      category: data.category,
      condition: data.condition,
      description: data.description,
      brand: data.brand,
      business_wallet: data.business_wallet,
      serial_number: data.serial_number,
      seller: {
        display_name: seller?.display_name ?? null,
        avatar_url: seller?.avatar_url ?? null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyError(err, 'Could not load this item — try again.') }, { status: 500 });
  }
}
