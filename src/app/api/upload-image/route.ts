import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthedWallets } from '@/lib/auth';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ALLOWED: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function POST(req: NextRequest) {
  // Auth: only signed-in users can upload — otherwise anyone could fill Storage with arbitrary files.
  const wallets = await getAuthedWallets(req);
  if (!wallets || wallets.length === 0) return NextResponse.json({ error: 'Sign in to upload' }, { status: 401 });

  const rl = await rateLimit(`upload:${clientIp(req)}`, { limit: 30, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  // Validate the MIME type (don't trust the filename) and size.
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: 'Only JPEG, PNG, WebP, or GIF images are allowed' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 12MB)' }, { status: 413 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  // Path uses a server-derived extension (not the user's filename) to avoid path/extension injection.
  const path = `items/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await supabase.storage.createBucket('item-images', { public: true }).catch(() => {});

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from('item-images').upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from('item-images').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
