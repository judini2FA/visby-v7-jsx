import { NextResponse } from 'next/server';
import { getAuthedWallets } from '@/lib/auth';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024;
// Server fallback for the in-browser cutout (hard images). Defaults to fal.ai BiRefNet; the model id is
// overridable in case the endpoint name changes. No-ops with 503 until FAL_KEY is set.
const MODEL = process.env.FAL_REMOVEBG_MODEL || 'fal-ai/birefnet';

export async function POST(req: Request) {
  const wallets = await getAuthedWallets(req);
  if (!wallets || wallets.length === 0) return NextResponse.json({ error: 'Sign in to use AI cutout' }, { status: 401 });

  const rl = await rateLimit(`removebg:${clientIp(req)}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return NextResponse.json({ error: 'AI background removal is not configured' }, { status: 503 });

  const fd = await req.formData();
  const file = fd.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only images are allowed' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 12MB)' }, { status: 413 });

  try {
    const dataUri = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
    const r = await fetch(`https://fal.run/${MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: dataUri }),
    });
    if (!r.ok) return NextResponse.json({ error: 'AI provider error' }, { status: 502 });
    const j = await r.json();
    const outUrl: string | undefined = j?.image?.url ?? j?.images?.[0]?.url;
    if (!outUrl) return NextResponse.json({ error: 'AI provider returned no image' }, { status: 502 });

    const img = await fetch(outUrl);
    if (!img.ok) return NextResponse.json({ error: 'Could not fetch result' }, { status: 502 });
    const out = Buffer.from(await img.arrayBuffer());
    return new NextResponse(out, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[remove-bg] error:', err);
    return NextResponse.json({ error: 'Background removal failed' }, { status: 500 });
  }
}
