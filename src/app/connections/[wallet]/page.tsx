'use client';

import { useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { t, S, surface, avatar, btn, tabSlider } from '@/lib/ui';

type Tab = 'followers' | 'following';

const AVATAR_GRADS = [
  'linear-gradient(135deg,#25CDB8,#2A8AED 50%,#BC2DE6)',
  'linear-gradient(135deg,#25CDB8,#22C6B7)',
  'linear-gradient(135deg,#2A8AED,#BC2DE6)',
  'linear-gradient(135deg,#22C6B7,#2A8AED)',
];

function shortAddr(a: string) {
  return a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export default function ConnectionsPage() {
  const router = useRouter();
  const { wallet } = useParams() as { wallet: string };
  const search = useSearchParams();
  const { login } = usePrivy();
  const { wallets: solWallets } = useSolanaWallets();
  const myWallet = solWallets?.[0]?.address ?? '';
  const isOwn = !!myWallet && myWallet === wallet;

  const initialTab: Tab = search.get('tab') === 'following' ? 'following' : 'followers';
  const [tab, setTab] = useState<Tab>(initialTab);

  const { data: profile } = trpc.profiles.getProfile.useQuery({ wallet }, { enabled: !!wallet });
  const { data: counts, refetch: refetchCounts } = trpc.follows.getCounts.useQuery({ wallet }, { enabled: !!wallet });

  const { data: list = [], isLoading, refetch } = trpc.follows.getConnections.useQuery(
    { wallet, type: tab, viewer_wallet: myWallet || undefined },
    { enabled: !!wallet }
  );

  const [over, setOver] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const followMut = trpc.follows.follow.useMutation({ onSuccess: () => refetchCounts() });
  const unfollowMut = trpc.follows.unfollow.useMutation({ onSuccess: () => refetchCounts() });

  const isFollowing = (w: string, fallback: boolean) => over[w] ?? fallback;

  const toggleFollow = (w: string, current: boolean) => {
    if (!myWallet) { login(); return; }
    setOver(o => ({ ...o, [w]: !current }));
    if (current) unfollowMut.mutate({ follower_wallet: myWallet, following_wallet: w });
    else followMut.mutate({ follower_wallet: myWallet, following_wallet: w });
  };

  const removeFollower = (w: string) => {
    if (!myWallet) return;
    setRemoved(s => new Set(s).add(w));
    unfollowMut.mutate({ follower_wallet: w, following_wallet: myWallet }, { onSuccess: () => { refetchCounts(); refetch(); } });
  };

  const title = profile?.display_name ?? shortAddr(wallet);
  const rows = list.filter(r => !removed.has(r.wallet));

  const tabs: { id: Tab; label: string }[] = [
    { id: 'followers', label: `Followers${counts ? ` ${counts.followers}` : ''}` },
    { id: 'following', label: `Following${counts ? ` ${counts.following}` : ''}` },
  ];

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
          <span style={{ ...t('title'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </div>
      </nav>

      <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 120 }}>
        {/* Tabs */}
        <div style={tabSlider().wrap}>
          {tabs.map(tt => (
            <button key={tt.id} onClick={() => { setTab(tt.id); }}
              style={{ ...tabSlider().item, ...(tab === tt.id ? tabSlider().itemActive : null) }}>
              {tt.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: S[4], display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {isLoading && [0, 1, 2, 3].map(i => (
            <div key={i} style={{ ...surface({ radius: 'var(--r-lg)' }), height: 72, animation: 'pulse 2s infinite' }} />
          ))}

          {!isLoading && rows.length === 0 && (
            <div style={{ ...surface({ radius: 'var(--r-lg)' }), padding: S[6], textAlign: 'center' }}>
              <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
                {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
              </div>
            </div>
          )}

          {!isLoading && rows.map((r, i) => {
            const name = r.display_name ?? shortAddr(r.wallet);
            const initials = (r.display_name ?? r.wallet).slice(0, 2).toUpperCase();
            const sub = r.bio?.trim() ? r.bio : `${r.listing_count} active listing${r.listing_count === 1 ? '' : 's'}`;
            const following = isFollowing(r.wallet, r.viewer_following);
            const isSelf = r.wallet === myWallet;
            return (
              <div key={r.wallet} style={{ ...surface({ radius: 'var(--r-lg)' }), display: 'flex', alignItems: 'center', gap: S[3], padding: '12px 16px' }}>
                <Link href={`/p/${r.wallet}`} style={{ display: 'flex', alignItems: 'center', gap: S[3], textDecoration: 'none', flex: 1, minWidth: 0 }}>
                  <div style={{ ...avatar('md'), background: AVATAR_GRADS[i % AVATAR_GRADS.length] }}>{initials}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
                  </div>
                </Link>

                {!isSelf && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexShrink: 0 }}>
                    <button onClick={() => toggleFollow(r.wallet, following)} style={btn(following ? 'secondary' : 'primary')}>
                      {following ? 'Following' : 'Follow'}
                    </button>
                    {isOwn && tab === 'followers' && (
                      <button onClick={() => removeFollower(r.wallet)} style={btn('text')}>Remove</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
