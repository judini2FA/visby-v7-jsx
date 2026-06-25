import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchProfileMap } from '@/lib/owners';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('items')
      .select(`*, ownership_history (*)`)
      .eq('id', params.id)
      .order('created_at', { referencedTable: 'ownership_history', ascending: true })
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Item not found', detail: error?.message }, { status: 404 });
    }

    // Resolve every owner's profile (avatar + name) so the seller block and history list can show
    // pictures next to wallets. Keyed by wallet; tolerant if avatar_url isn't migrated yet.
    const hist = (data.ownership_history ?? []) as any[];
    const profiles = await fetchProfileMap(supabase, [
      data.current_owner_wallet,
      ...hist.flatMap((h) => [h.owner_wallet, h.from_wallet]),
    ]);

    return NextResponse.json({ ...data, profiles });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
