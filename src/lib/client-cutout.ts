// Browser-side background removal for the SDK checkout (option A): the SAME @imgly engine the main app's
// cutout-editor uses, run headlessly (no UI) on the buyer's device. Given a product image URL it fetches
// the photo and returns a transparent PNG blob, or null on any failure (CORS-tainted image, unsupported
// device, model download blocked) so the caller can fall back to the raw photo / server-side cutout.
//
// Keep the publicPath version + model in sync with cutout-editor.tsx (staticimgly.com is already in the
// CSP connect-src allowlist; worker-src/script-src allow the blob: worker + wasm).
export async function cutoutPngFromUrl(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const src = await res.blob();
    if (!src.type.startsWith('image/')) return null;
    const { removeBackground } = await import('@imgly/background-removal');
    return await removeBackground(src, {
      publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/',
      model: 'isnet_quint8',
      output: { format: 'image/png' },
    });
  } catch {
    return null;
  }
}
