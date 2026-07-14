import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchProfileMap } from '@/lib/owners';
import { friendlyError } from '@/lib/friendly-error';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('items')
      .select(`*, ownership_history (*)`)
      .eq('id', id)
      .order('created_at', { referencedTable: 'ownership_history', ascending: true })
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
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
    return NextResponse.json({ error: friendlyError(err, 'Could not load this item — try again.') }, { status: 500 });
  }
}
