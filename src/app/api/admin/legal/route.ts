export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminWallet } from '@/lib/admin';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Admin uploads a Terms/Privacy PDF. Gated like the other admin routes (callerOwnsWallet + isAdminWallet).
// Stores the file in the public `legal-docs` Storage bucket and records its URL in legal_documents.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });

  const wallet = form.get('wallet');
  if (typeof wallet !== 'string' || !wallet) return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminWallet(wallet)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const kind = form.get('kind');
  if (kind !== 'terms' && kind !== 'privacy') return NextResponse.json({ error: 'kind must be terms or privacy' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) return NextResponse.json({ error: 'PDF too large (max 10MB)' }, { status: 413 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await supabase.storage.createBucket('legal-docs', { public: true }).catch(() => {});

  const path = `${kind}/${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage.from('legal-docs').upload(path, buffer, { contentType: 'application/pdf', upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = supabase.storage.from('legal-docs').getPublicUrl(path);

  const { error: dbErr } = await supabase
    .from('legal_documents')
    .upsert({ kind, url: pub.publicUrl, updated_at: new Date().toISOString(), updated_by: wallet }, { onConflict: 'kind' });
  if (dbErr) {
    // File is stored; only the pointer failed (e.g. table not migrated yet). Surface both so admin knows.
    return NextResponse.json({ error: 'Uploaded the file but could not save it (run migration_legal_documents.sql): ' + dbErr.message, url: pub.publicUrl }, { status: 500 });
  }

  return NextResponse.json({ ok: true, kind, url: pub.publicUrl });
}
