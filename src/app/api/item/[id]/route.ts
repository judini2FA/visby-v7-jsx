import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

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

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
