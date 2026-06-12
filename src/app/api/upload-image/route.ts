import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `items/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // Ensure bucket exists (service role can create it if missing)
  await supabase.storage.createBucket('item-images', { public: true }).catch(() => {});

  const bytes  = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { error } = await supabase.storage
    .from('item-images')
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from('item-images').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
