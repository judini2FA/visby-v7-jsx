import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||   // PostgREST: table not in schema cache (missing table)
    error.code === '42703' ||
    error.code === 'PGRST202' ||   // PostgREST: function not found (missing RPC)
    error.code === '42883' ||
    !!error.message?.includes('does not exist')
  );
}

export async function POST(req: Request) {
  try {
    const { item_id, viewer_wallet } = await req.json();

    if (!item_id || typeof item_id !== 'string') {
      return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error: insertError } = await supabase
      .from('item_views')
      .insert({ item_id, viewer_wallet: viewer_wallet ?? null });
    if (insertError && !isMissingSchema(insertError)) {
      console.error('[items/view/POST] insert error:', insertError);
    }

    const { error: rpcError } = await supabase.rpc('increment_item_view', { p_item: item_id });
    if (rpcError && !isMissingSchema(rpcError)) {
      console.error('[items/view/POST] increment error:', rpcError);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[items/view/POST] error:', err);
    return NextResponse.json({ ok: true });
  }
}
