'use client';

import { useRouter } from 'next/navigation';

function grad(seed: string): string {
  if (!seed) return 'linear-gradient(135deg,#25CDB8,#2A8AED 50%,#BC2DE6)';
  const a = (seed.charCodeAt(0) * 7) % 360;
  const b = (seed.charCodeAt(Math.min(4, seed.length - 1)) * 13) % 360;
  return `linear-gradient(135deg, hsl(${a},70%,55%), hsl(${b},70%,45%))`;
}

export function AvatarCircle({
  wallet, avatarUrl, size = 28, ring = 'var(--glass-bg)',
}: { wallet: string; avatarUrl?: string | null; size?: number; ring?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: avatarUrl ? 'var(--surface-bg)' : grad(wallet),
      color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.4), fontFamily: "'Inter',sans-serif",
      boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (wallet[0] ?? '?').toUpperCase()}
    </div>
  );
}

// Overlapping owner avatars for a listing thumbnail. `owners` is the chain oldest → newest; the most
// recent is drawn leftmost and ON TOP (highest z-index), older owners fanning behind it. One owner =
// one circle. Clicking deep-links to the item's ownership history. Safe to nest inside a card <Link>:
// it stops propagation and navigates itself.
export function OwnerStack({
  owners, href, size = 26, ring = 'var(--glass-bg)',
}: {
  owners: { wallet: string; avatar_url?: string | null }[];
  href: string;
  size?: number;
  ring?: string;
}) {
  const router = useRouter();
  const list = owners ?? [];
  if (!list.length) return null;

  const newestFirst = [...list].reverse();
  const overlap = Math.round(size * 0.4);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="View ownership history"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(href); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(href); } }}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
    >
      {newestFirst.map((o, i) => (
        <div key={o.wallet + i} style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: newestFirst.length - i, position: 'relative' }}>
          <AvatarCircle wallet={o.wallet} avatarUrl={o.avatar_url} size={size} ring={ring} />
        </div>
      ))}
    </div>
  );
}
