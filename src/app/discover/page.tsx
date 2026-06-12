'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { t, S, card, surface, avatar, btn, sectionLabel } from '@/lib/ui';

const AVATAR_GRADS = [
  'linear-gradient(135deg,#6DE4D5,#59B4F5 50%,#D54AF2)',
  'linear-gradient(135deg,#6DE4D5,#5ED9D1)',
  'linear-gradient(135deg,#59B4F5,#D54AF2)',
  'linear-gradient(135deg,#5ED9D1,#59B4F5)',
];

function shortAddr(a: string) {
  return a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export default function DiscoverPage() {
  const router = useRouter();
  const { login } = usePrivy();
  const { wallets: solWallets } = useSolanaWallets();
  const myWallet = solWallets?.[0]?.address ?? '';

  const { data: sellers = [], isLoading } = trpc.follows.getSuggested.useQuery({
    wallet: myWallet || undefined,
  });

  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const followMut = trpc.follows.follow.useMutation();
  const unfollowMut = trpc.follows.unfollow.useMutation();

  const toggle = (w: string) => {
    if (!myWallet) { login(); return; }
    if (followed.has(w)) {
      unfollowMut.mutate({ follower_wallet: myWallet, following_wallet: w });
      setFollowed(s => { const n = new Set(s); n.delete(w); return n; });
    } else {
      followMut.mutate({ follower_wallet: myWallet, following_wallet: w });
      setFollowed(s => new Set(s).add(w));
    }
  };

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--glass-bg-strong)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
        borderBottom: '1px solid var(--divider)',
        boxShadow: '0 2px 16px rgba(0,0,0,.06)',
      }}>
        <div className="visby-inner" style={{ display: 'flex', alignItems: 'center', gap: S[3], paddingTop: S[3], paddingBottom: S[3] }}>
          <button onClick={() => router.back()} aria-label="Back" style={{ ...surface({ radius: 'var(--r-sm)', pad: 8 }), display: 'flex', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style={{ ...t('title'), color: 'var(--text-strong)' }}>Discover Sellers</span>
        </div>
      </nav>

      <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 120 }}>
        <div style={{ marginBottom: S[4] }}>
          <span style={sectionLabel()}>Sellers to follow</span>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ ...surface({ radius: 'var(--r-lg)' }), height: 72, animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        )}

        {!isLoading && sellers.length === 0 && (
          <div style={{ ...card(), padding: S[6], textAlign: 'center' }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[2] }}>No sellers to suggest yet</div>
            <div style={{ ...t('body'), color: 'var(--text-muted)', marginBottom: S[5] }}>
              You're caught up — no new sellers with active listings right now. Browse the marketplace to find more.
            </div>
            <Link href="/marketplace" style={btn('primary')}>Browse marketplace</Link>
          </div>
        )}

        {!isLoading && sellers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {sellers.map((s, i) => {
              const isFollowing = followed.has(s.wallet);
              const name = s.display_name ?? shortAddr(s.wallet);
              const initials = (s.display_name ?? s.wallet).slice(0, 2).toUpperCase();
              const sub = s.bio?.trim()
                ? s.bio
                : `${s.listing_count} active listing${s.listing_count === 1 ? '' : 's'}`;
              return (
                <div key={s.wallet} style={{ ...surface({ radius: 'var(--r-lg)' }), display: 'flex', alignItems: 'center', gap: S[3], padding: '12px 16px' }}>
                  <Link href={`/p/${s.wallet}`} style={{ display: 'flex', alignItems: 'center', gap: S[3], textDecoration: 'none', flex: 1, minWidth: 0 }}>
                    <div style={{ ...avatar('md'), background: AVATAR_GRADS[i % AVATAR_GRADS.length] }}>{initials}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                      <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
                    </div>
                  </Link>
                  <button onClick={() => toggle(s.wallet)} style={btn(isFollowing ? 'secondary' : 'primary')}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
