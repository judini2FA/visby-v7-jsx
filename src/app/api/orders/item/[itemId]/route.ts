import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

// Public, minimal order status for an item (no PII — no address, tracking number, or wallets).
// Used by the item page to show a "sold / in transit / delivered" state.
export async function GET(_req: Request, { params }: { params: { itemId: string } }) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('orders')
      .select('status, shipped_at, delivered_at')
      .eq('item_id', params.itemId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ order: null });   // table missing → none
    return NextResponse.json({ order: data ?? null });
  } catch {
    return NextResponse.json({ order: null });
  }
}
