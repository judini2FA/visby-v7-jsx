'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const GD = `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`;

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)    return 'just now';
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CAT_ACCENT: Record<string, string> = {
  Sneakers: 'var(--text-muted)', Watches: 'var(--text-muted)', Bags: 'var(--text-muted)',
  Memorabilia: 'var(--text-muted)', Vintage: 'var(--text-muted)', Electronics: 'var(--text-muted)', Other: 'var(--text-muted)',
};

function ItemCard({ item, index }: { item: any; index: number }) {
  return (
    <Link href={`/item/${item.id}`} style={{ textDecoration: 'none', animation: `fadeUp .35s ease both`, animationDelay: `${index * 60}ms` }}>
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, overflow: 'hidden', transition: 'border-color .2s' }}>
        {/* Image */}
        <div style={{ height: 130, background: item.image_url ? 'transparent' : 'var(--glass-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {item.image_url
            ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          }
          {item.is_listed && (
            <div style={{ position: 'absolute', top: 8, right: 8, background: GD, borderRadius: 8, padding: '3px 8px', fontSize: 9, fontWeight: 700, color: '#fff', fontFamily: "'Quicksand',sans-serif" }}>
              LISTED
            </div>
          )}
        </div>
        {/* Info */}
        <div style={{ padding: '10px 12px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <span style={{ fontSize: 9, color: CAT_ACCENT[item.category] ?? C.muted, fontFamily: "'Quicksand',sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.condition}</span>
            {item.is_listed && item.price_usdc
              ? <span style={{ fontSize: 12, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>${item.price_usdc}</span>
              : <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Quicksand',sans-serif" }}>not listed</span>
            }
          </div>
        </div>
      </div>
    </Link>
  );
}

function SoldRow({ sale, index }: { sale: any; index: number }) {
  const item = sale.items;
  if (!item) return null;
  return (
    <Link href={`/item/${item.id}`} style={{ textDecoration: 'none', animation: `fadeUp .35s ease both`, animationDelay: `${index * 50}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: item.image_url ? 'transparent' : 'var(--glass-bg)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.image_url
            ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Quicksand',sans-serif", marginTop: 2 }}>
            {item.category} · {timeAgo(sale.created_at)}
          </div>
        </div>
        {sale.price_usdc && (
          <div style={{ fontSize: 13, fontWeight: 800, color: C.green, fontFamily: "'Quicksand',sans-serif", flexShrink: 0 }}>
            +${sale.price_usdc}
          </div>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </Link>
  );
}

export default function PublicProfilePage() {
  const { wallet } = useParams() as { wallet: string };
  const { user }   = usePrivy();
  const { wallets: solWallets } = useSolanaWallets();
  const myWallet = solWallets?.[0]?.address ?? '';
  const profileWallet = wallet as string;
  const { address: myVisbWallet } = useVisbWallet();
  const isMe = !!(myVisbWallet && myVisbWallet.toLowerCase() === wallet?.toLowerCase());

  const { data: followData, refetch: refetchFollow } = trpc.follows.isFollowing.useQuery(
    { follower_wallet: myWallet, following_wallet: profileWallet },
    { enabled: !!myWallet && !!profileWallet && myWallet !== profileWallet }
  );
  const isFollowing = followData?.following ?? false;

  const followMut   = trpc.follows.follow.useMutation({ onSuccess: () => refetchFollow() });
  const unfollowMut = trpc.follows.unfollow.useMutation({ onSuccess: () => refetchFollow() });

  const { data: profile } = trpc.profiles.getProfile.useQuery(
    { wallet },
    { enabled: !!wallet }
  );

  const { data: ownedItems = [], isLoading: loadingOwned } = trpc.listings.getByOwner.useQuery(
    { wallet },
    { enabled: !!wallet }
  );

  const { data: soldItems = [], isLoading: loadingSold } = trpc.listings.getSoldByWallet.useQuery(
    { wallet },
    { enabled: !!wallet }
  );

  const listedItems   = ownedItems.filter((i: any) => i.is_listed);
  const unlistedItems = ownedItems.filter((i: any) => !i.is_listed);

  const totalVolume = soldItems.reduce((acc: number, s: any) => acc + (s.price_usdc ?? 0), 0);

  // Seller trust tier — derived from on-chain completed sales
  const salesCount = soldItems.length;
  const trustTier = salesCount >= 25 ? { label: 'Elite Seller',   stars: 4, color: 'var(--text-strong)' }
                  : salesCount >= 10 ? { label: 'Top Seller',     stars: 3, color: 'var(--text-strong)' }
                  : salesCount >= 5  ? { label: 'Trusted Seller', stars: 2, color: 'var(--text-strong)' }
                  : salesCount >= 1  ? { label: 'Rising Seller',  stars: 1, color: 'var(--text-strong)' }
                  : null;

  const avatarGrad = GD;
  const initials = wallet ? wallet.slice(0, 2).toUpperCase() : '??';

  const isLoading = loadingOwned || loadingSold;

  const [privateMode, setPrivateMode] = useState(false);
  useEffect(() => {
    try { setPrivateMode(localStorage.getItem('visby-private-mode') === '1'); } catch {}
  }, []);

  return (
    <div style={{ background: C.navy, minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: 13, paddingBottom: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
            {isMe ? 'My Profile' : 'Seller Profile'}
          </div>
          {isMe && (
            <Link href="/profile" style={{ fontSize: 12, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: "'Quicksand',sans-serif" }}>
              Edit
            </Link>
          )}
        </div>
      </div>

      <div className="visby-inner" style={{ paddingBottom: 120 }}>

        {/* Profile hero */}
        <div style={{ padding: '28px 0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>

          {/* Avatar */}
          <div style={{ position: 'relative' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: avatarGrad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff', border: '3px solid var(--glass-border)' }}>
              {initials}
            </div>
            {/* Verified badge */}
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--glass-bg-strong)', border: '2px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>

          {/* Address + trust */}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>
              {profile?.display_name ?? shortAddr(wallet)}
            </div>
            {profile?.display_name && (
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", marginBottom: 2 }}>
                {shortAddr(wallet)}
              </div>
            )}
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", marginBottom: trustTier ? 10 : 0 }}>
              {isMe ? 'You · ' : ''}Verified · Solana
            </div>
            {profile?.bio && (
              <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 6, maxWidth: 280 }}>
                {profile.bio}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: "'Manrope',sans-serif", letterSpacing: '0.06em' }}>
              {wallet.slice(0, 6)}…{wallet.slice(-6)}
            </div>
            {!isLoading && trustTier && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '5px 12px' }}>
                <span style={{ color: trustTier.color, display: 'flex', gap: 1 }}>
                  {Array.from({ length: 4 }, (_, i) => (
                    <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={i < trustTier.stars ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  ))}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: trustTier.color, fontFamily: "'Quicksand',sans-serif" }}>
                  {trustTier.label}
                </span>
              </div>
            )}
            {!isLoading && !trustTier && salesCount === 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '5px 12px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Quicksand',sans-serif" }}>New Seller</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 0, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', borderRadius: 20, border: '1px solid var(--glass-border)', overflow: 'hidden', width: '100%', maxWidth: 340 }}>
            {[
              { label: 'Owns', value: isLoading ? '—' : ownedItems.length },
              { label: 'Listed', value: isLoading ? '—' : listedItems.length },
              { label: 'Sold', value: isLoading ? '—' : soldItems.length },
              { label: 'Volume', value: isLoading ? '—' : `$${totalVolume.toFixed(0)}` },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ flex: 1, padding: '14px 8px', textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <div style={{ fontSize: 17, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.value}</div>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: "'Quicksand',sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {isMe && (
            <Link href="/dashboard/seller" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: GH, borderRadius: 12, padding: '10px 22px', fontWeight: 700, fontSize: 13, color: '#fff', textDecoration: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Sell an Item
            </Link>
          )}

          {!privateMode && myWallet && myWallet !== profileWallet && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => isFollowing
                  ? unfollowMut.mutate({ follower_wallet: myWallet, following_wallet: profileWallet })
                  : followMut.mutate({ follower_wallet: myWallet, following_wallet: profileWallet })
                }
                disabled={followMut.isPending || unfollowMut.isPending}
                style={{
                  background: isFollowing ? 'var(--glass-bg)' : `linear-gradient(90deg,#6DE4D5,#59B4F5 50%,#D54AF2)`,
                  border: isFollowing ? '1px solid var(--glass-border)' : 'none',
                  borderRadius: 20,
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: isFollowing ? 'var(--text-muted)' : '#fff',
                  cursor: 'pointer',
                  opacity: (followMut.isPending || unfollowMut.isPending) ? 0.7 : 1,
                  transition: 'all .2s',
                }}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
              <Link href={`/dashboard?msg=${profileWallet}`}
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '8px 18px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Message
              </Link>
            </div>
          )}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 72, background: 'var(--glass-bg)', borderRadius: 20, border: '1px solid var(--glass-border)', animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        )}

        {!isLoading && (
          <>
            {/* Listed for sale */}
            {listedItems.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                  Listed for Sale · {listedItems.length}
                </div>
                <div className="visby-grid">
                  {listedItems.map((item: any, i: number) => (
                    <ItemCard key={item.id} item={item} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Owned items (not listed) */}
            {unlistedItems.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                  Collection · {unlistedItems.length}
                </div>
                <div className="visby-grid">
                  {unlistedItems.map((item: any, i: number) => (
                    <ItemCard key={item.id} item={item} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Sold items */}
            {soldItems.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                  Sold · {soldItems.length}
                </div>
                <div>
                  {soldItems.map((sale: any, i: number) => (
                    <SoldRow key={sale.id} sale={sale} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {ownedItems.length === 0 && soldItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
                No activity yet
                {isMe && (
                  <div style={{ marginTop: 16 }}>
                    <Link href="/mint" style={{ color: 'var(--text-strong)', textDecoration: 'none', fontSize: 13 }}>Mint your first item →</Link>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
}
