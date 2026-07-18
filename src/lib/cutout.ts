import { createServiceClient } from '@/lib/supabase/service';

// Server-side background removal for SDK provenance mints. The main app cuts photos in the BROWSER
// (@imgly, see cutout-editor.tsx) before upload, but an SDK merchant POSTs a raw image_url over the API —
// there's no browser in that path. So the cutout runs server-side at mint time via the same hosted
// provider the manual /api/remove-bg fallback uses (fal.ai BiRefNet). It is strictly best-effort: with no
// FAL_KEY, or on any provider/upload error, it returns null and the mint keeps the raw photo — a missing
// cutout must NEVER fail a paid order.

const FAL_MODEL = process.env.FAL_REMOVEBG_MODEL || 'fal-ai/birefnet';

async function removeBackgroundViaFal(dataUri: string): Promise<Buffer | null> {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return null;
  try {
    const r = await fetch(`https://fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: dataUri }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const outUrl: string | undefined = j?.image?.url ?? j?.images?.[0]?.url;
    if (!outUrl) return null;
    const img = await fetch(outUrl);
    if (!img.ok) return null;
    return Buffer.from(await img.arrayBuffer());
  } catch {
    return null;
  }
}

// Normalize to a trimmed, alpha-preserving PNG (mirrors the trim step in /api/upload-image so the subject
// fills the frame instead of floating in the original photo's margins). Any sharp failure keeps the raw bytes.
async function normalizeCutout(png: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    try {
      return await sharp(png).png().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 }).toBuffer();
    } catch {
      return await sharp(png).png().toBuffer();
    }
  } catch {
    return png;
  }
}

// Fetch the source photo, strip its background, and upload the transparent PNG to Storage. Returns the
// public cutout URL, or null if cutout is unavailable/unconfigured/failed (caller keeps the raw image).
export async function generateCutout(imageUrl: string | null | undefined): Promise<string | null> {
  if (!imageUrl) return null;
  if (!process.env.FAL_KEY) return null;

  let dataUri: string;
  try {
    const src = await fetch(imageUrl);
    if (!src.ok) return null;
    const contentType = src.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    dataUri = `data:${contentType};base64,${Buffer.from(await src.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }

  const cut = await removeBackgroundViaFal(dataUri);
  if (!cut) return null;
  const png = await normalizeCutout(cut);

  try {
    const supabase = createServiceClient();
    await supabase.storage.createBucket('item-images', { public: true }).catch(() => {});
    const path = `cutouts/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const { error } = await supabase.storage.from('item-images').upload(path, png, { contentType: 'image/png', upsert: false });
    if (error) return null;
    return supabase.storage.from('item-images').getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}
