import { ImageResponse } from 'next/og';
import { createServiceClient } from '@/lib/supabase/service';

// Blueprint 7.10 — dynamic share/OG image for an item page. When a listing link is shared (iMessage,
// X, Slack…), this renders a branded card with the item photo, name, price, and the "authentic on
// Visby" proof — the shareability hook for "the first [brand] drop with on-chain provenance".
export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Visby — provenance-verified luxury item';

export default async function Image({ params }: { params: { id: string } }) {
  let item: { name?: string; image_url?: string | null; price_usdc?: number | null; brand?: string | null } | null = null;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('items')
      .select('name, image_url, price_usdc, brand')
      .eq('id', params.id)
      .maybeSingle();
    item = data;
  } catch { /* fall back to the generic branded card */ }

  const name = item?.name || 'Visby';
  const brand = item?.brand || null;
  const price = item?.price_usdc != null ? `$${Number(item.price_usdc).toFixed(2)}` : null;
  const img = item?.image_url || null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(135deg, #0e1116 0%, #141a2a 55%, #1a1030 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        {img ? (
          <div style={{ display: 'flex', width: 540, height: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" width={540} height={630} style={{ width: 540, height: 630, objectFit: 'cover' }} />
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 64, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 800, letterSpacing: 1 }}>
            <span style={{ background: 'linear-gradient(135deg,#25CDB8,#2A8AED,#BC2DE6)', backgroundClip: 'text', color: 'transparent' }}>VISBY</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {brand ? <div style={{ display: 'flex', fontSize: 28, color: '#9aa4b6', marginBottom: 8 }}>{brand}</div> : null}
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>{name.length > 60 ? name.slice(0, 57) + '…' : name}</div>
            {price ? <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, marginTop: 20 }}>{price}</div> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, color: '#c9d2e0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 20, background: '#0dbf8f', marginRight: 14 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            Authenticity verified on-chain
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
