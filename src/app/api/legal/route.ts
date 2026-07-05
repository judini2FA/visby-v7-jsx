export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Public read of the current legal-document URLs. `?kind=terms|privacy|acceptable_use|seller_agreement` →
// { url } for that doc; no kind → { terms, privacy, acceptable_use, seller_agreement}. Returns null(s) when
// the row/table is absent (pre-migration) so the legal pages fall back to the "being finalized" state
// instead of erroring.
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get('kind');
  const supabase = createServiceClient();
  try {
    if (kind === 'terms' || kind === 'privacy' || kind === 'acceptable_use' || kind === 'seller_agreement') {
      const { data } = await supabase.from('legal_documents').select('url').eq('kind', kind).maybeSingle();
      return NextResponse.json({ url: (data as any)?.url ?? null });
    }
    const { data } = await supabase.from('legal_documents').select('kind, url');
    const map = Object.fromEntries(((data ?? []) as any[]).map(r => [r.kind, r.url]));
    return NextResponse.json({ terms: map.terms ?? null, privacy: map.privacy ?? null, acceptable_use: map.acceptable_use ?? null, seller_agreement: map.seller_agreement ?? null });
  } catch {
    return NextResponse.json(kind ? { url: null } : { terms: null, privacy: null, acceptable_use: null, seller_agreement: null });
  }
}
