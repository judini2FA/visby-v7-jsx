export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Public read of the current legal-document URLs. `?kind=terms|privacy` → { url } for that doc; no kind →
// { terms, privacy }. Returns null(s) when the row/table is absent (pre-migration) so the legal pages
// fall back to the "being finalized" state instead of erroring.
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get('kind');
  const supabase = createServiceClient();
  try {
    if (kind === 'terms' || kind === 'privacy') {
      const { data } = await supabase.from('legal_documents').select('url').eq('kind', kind).maybeSingle();
      return NextResponse.json({ url: (data as any)?.url ?? null });
    }
    const { data } = await supabase.from('legal_documents').select('kind, url');
    const map = Object.fromEntries(((data ?? []) as any[]).map(r => [r.kind, r.url]));
    return NextResponse.json({ terms: map.terms ?? null, privacy: map.privacy ?? null });
  } catch {
    return NextResponse.json(kind ? { url: null } : { terms: null, privacy: null });
  }
}
