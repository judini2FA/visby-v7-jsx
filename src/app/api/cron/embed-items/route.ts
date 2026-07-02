import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { embedText, embeddingModel, semanticEnabled } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Backfills text-embedding vectors for listed items so semantic search has something to match. Bounded
// per run (a large catalog catches up over successive runs); can also be curl'd manually after adding an
// embeddings key. Cron-authed like the other sweeps; no-op when no embeddings key is configured.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers.get('x-cron-secret') ?? '');
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!semanticEnabled()) return NextResponse.json({ ok: true, embedded: 0, note: 'EMBEDDINGS_API_KEY not set' });

  const supabase = createServiceClient();
  const model = embeddingModel();

  // Only items that still need work: never embedded, or embedded by a different model.
  const { data: rows, error } = await supabase
    .from('items')
    .select('id, name, category, description')
    .eq('is_listed', true)
    .or(`embedding.is.null,embedding_model.neq.${model}`)
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let embedded = 0, failed = 0;
  for (const r of rows ?? []) {
    const text = [r.name, r.category, r.description].filter(Boolean).join(' — ').slice(0, 8000);
    const vec = await embedText(text);
    if (!vec) { failed++; continue; }
    const { error: upErr } = await supabase
      .from('items').update({ embedding: vec, embedding_model: model }).eq('id', r.id);
    if (upErr) { failed++; continue; }
    embedded++;
  }

  return NextResponse.json({ ok: true, scanned: rows?.length ?? 0, embedded, failed });
}

export const GET = handle;
export const POST = handle;
