'use client';

import Link from 'next/link';
import { AvatarCircle } from '@/components/owner-stack';

// The "Tally" — the provenance NFT as a tangible object: a compact, glossy, rounded card made of a
// lightened brand gradient, showing the title, serial, and every owner's avatar. Used in the wallet.
const INK = '#15121C';
const INK_DIM = 'rgba(21,18,28,.6)';
const SHINE = 'linear-gradient(125deg, rgba(255,255,255,0) 34%, rgba(255,255,255,.5) 50%, rgba(255,255,255,0) 66%), radial-gradient(120% 80% at 14% 0%, rgba(255,255,255,.5), rgba(255,255,255,0) 55%)';

export function TallyCard({
  name, serial, owners, href,
}: {
  name: string;
  serial?: string | null;
  owners: { wallet: string; avatar_url?: string | null }[];
  href?: string;
}) {
  const chain = owners ?? [];
  const newestFirst = [...chain].reverse();   // most recent owner drawn on top

  const inner = (
    <div style={{
      position: 'relative', overflow: 'hidden',
      borderRadius: 'var(--r-lg)', background: 'var(--grad-tally)',
      padding: '13px 14px', color: INK,
      boxShadow: '0 6px 18px rgba(30,30,45,.16), inset 0 1px 0 rgba(255,255,255,.7)',
    }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: SHINE }} />

      {/* title + Tally chip */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: INK, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{name}</div>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', color: INK_DIM, border: '1px solid rgba(21,18,28,.22)', borderRadius: 999, padding: '2px 6px', flexShrink: 0 }}>TALLY</span>
      </div>

      {serial && <div style={{ position: 'relative', fontFamily: 'monospace', fontSize: 10.5, color: INK_DIM, marginTop: 5 }}>SN · {serial}</div>}

      {/* every owner's profile pic, overlapping */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 10 }}>
        {newestFirst.map((o, i) => (
          <div key={o.wallet + i} style={{ marginLeft: i === 0 ? 0 : -9, zIndex: newestFirst.length - i, position: 'relative' }}>
            <AvatarCircle wallet={o.wallet} avatarUrl={o.avatar_url} size={24} ring="rgba(255,255,255,.85)" />
          </div>
        ))}
        <span style={{ fontSize: 11, fontWeight: 600, color: INK_DIM, marginLeft: chain.length ? 8 : 0 }}>
          {chain.length} owner{chain.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );

  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link> : inner;
}
