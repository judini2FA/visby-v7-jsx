import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

// Point a still-pending SDK order's image at a browser-generated cutout (option A). The checkout page cuts
// the product photo client-side, uploads the transparent PNG via /api/upload-image (which requires the
// buyer's auth and stores it in our own bucket), then calls this to record it on the order BEFORE payment,
// so the existing mint records the cutout on the Tally — no change to the money path.
//
// Safety: the URL must live under OUR public item-images bucket (so this can't inject an arbitrary external
// image), and the update only touches a row that is still 'pending' (never a paid/minted order).
const BUCKET_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/item-images/`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.startsWith('cart_')) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const image_url = body?.image_url;
  if (typeof image_url !== 'string' || !image_url.startsWith(BUCKET_PREFIX)) {
    return NextResponse.json({ error: 'Invalid image' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('sdk_orders')
    .update({ image_url })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not update' }, { status: 500 });
  return NextResponse.json({ ok: !!data });
}
