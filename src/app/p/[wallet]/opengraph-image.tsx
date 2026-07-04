import { ImageResponse } from 'next/og';
import { createServiceClient } from '@/lib/supabase/service';

// Blueprint 7.10 — dynamic share/OG image for a public seller profile.
export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Visby seller profile';

export default async function Image({ params }: { params: { wallet: string } }) {
  let profile: { display_name?: string | null; username?: string | null; avatar_url?: string | null; bio?: string | null; account_type?: string | null } | null = null;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url, bio, account_type')
      .eq('wallet', params.wallet)
      .maybeSingle();
    profile = data;
  } catch { /* generic branded card */ }

  const name = profile?.display_name || (profile?.username ? `@${profile.username}` : 'Seller on Visby');
  const handle = profile?.username ? `@${profile.username}` : null;
  const bio = profile?.bio || null;
  const avatar = profile?.avatar_url || null;
  const isBusiness = profile?.account_type === 'business';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0e1116 0%, #141a2a 55%, #1a1030 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
          padding: 72,
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 1 }}>
          <span style={{ background: 'linear-gradient(135deg,#25CDB8,#2A8AED,#BC2DE6)', backgroundClip: 'text', color: 'transparent' }}>VISBY</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" width={160} height={160} style={{ width: 160, height: 160, borderRadius: 80, objectFit: 'cover', marginRight: 40 }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 160, height: 160, borderRadius: 80, marginRight: 40, background: 'linear-gradient(135deg,#25CDB8,#2A8AED,#BC2DE6)', fontSize: 72, fontWeight: 800 }}>
              {name.replace('@', '').charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 60, fontWeight: 800, lineHeight: 1.05 }}>{name.length > 32 ? name.slice(0, 30) + '…' : name}</div>
            {handle && name !== handle ? <div style={{ display: 'flex', fontSize: 30, color: '#9aa4b6', marginTop: 8 }}>{handle}</div> : null}
            {isBusiness ? <div style={{ display: 'flex', fontSize: 26, color: '#25CDB8', marginTop: 8 }}>Verified business</div> : null}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 28, color: '#c9d2e0' }}>
          {bio ? (bio.length > 90 ? bio.slice(0, 87) + '…' : bio) : 'Buy & sell authentic luxury with on-chain provenance'}
        </div>
      </div>
    ),
    { ...size },
  );
}
