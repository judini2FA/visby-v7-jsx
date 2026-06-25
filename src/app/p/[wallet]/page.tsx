'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, price, card, surface, btn, badge, sectionLabel, avatar, T } from '@/lib/ui';
import { useCurrency } from '@/lib/currency';
import { StarRating, ReputationBadge, ReviewList } from '@/components/reviews';
import { BlockButton } from '@/components/block-button';
import { ReportButton } from '@/components/report-button';
import { HeaderMenu } from '@/components/layout/header-menu';
import { ListingCard } from '@/components/listing-card';

const GD = T.gradBrand;

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


function SoldRow({ sale, index }: { sale: any; index: number }) {
  const item = sale.items;
  if (!item) return null;
  return (
    <Link href={`/item/${item.id}`} style={{ textDecoration: 'none', animation: `fadeUp .35s ease both`, animationDelay: `${index * 50}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ ...surface({ radius: 14 }), width: 48, height: 48, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.image_url
            ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>
            {item.category} · {timeAgo(sale.created_at)}
          </div>
        </div>
        {sale.price_usdc && (
          <div style={{ ...t('heading'), color: 'var(--ok)', flexShrink: 0 }}>
            +${sale.price_usdc.toLocaleString()}
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
  const { user, getAccessToken }   = usePrivy();
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

  const { data: counts, refetch: refetchCounts } = trpc.follows.getCounts.useQuery(
    { wallet: profileWallet },
    { enabled: !!profileWallet }
  );

  const followMut   = trpc.follows.follow.useMutation({ onSuccess: () => { refetchFollow(); refetchCounts(); } });
  const unfollowMut = trpc.follows.unfollow.useMutation({ onSuccess: () => { refetchFollow(); refetchCounts(); } });

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

  const { data: rep } = trpc.reviews.getBySeller.useQuery(
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
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <Link href="/" style={{ display: 'flex', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div style={{ ...t('heading'), flex: 1, color: 'var(--text-strong)' }}>
            {isMe ? 'My Profile' : 'Seller Profile'}
          </div>
          {isMe && (
            <Link href="/profile" style={{ ...btn('text') }}>
              Edit
            </Link>
          )}
          <HeaderMenu />
        </div>
      </div>

      <div className="visby-inner" style={{ paddingBottom: 120 }}>

        {/* Profile hero */}
        <div style={{ padding: '28px 0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[4], textAlign: 'center' }}>

          {/* Avatar */}
          <div style={{ position: 'relative' }}>
            <div style={{ ...avatar('lg'), width: 80, height: 80, fontSize: 28, background: profile?.avatar_url ? 'var(--surface-bg)' : avatarGrad }}>
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>

          </div>

          {/* Name + bio + trust */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2] }}>
            <div style={{ ...t('title'), color: 'var(--text-strong)' }}>
              {profile?.display_name ?? shortAddr(wallet)}
            </div>
            {profile?.bio && (
              <div style={{ ...t('body'), color: 'var(--text)', maxWidth: 280 }}>
                {profile.bio}
              </div>
            )}
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
              {wallet.slice(0, 6)}…{wallet.slice(-6)}
            </div>
            {!isLoading && trustTier && (
              <div style={{ ...surface({ radius: 'var(--pill)' }), display: 'inline-flex', alignItems: 'center', gap: S[1], padding: '5px 12px', marginTop: S[1] }}>
                <span style={{ color: trustTier.color, display: 'flex', gap: 1 }}>
                  {Array.from({ length: 4 }, (_, i) => (
                    <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={i < trustTier.stars ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  ))}
                </span>
                <span style={{ ...t('micro'), color: trustTier.color }}>
                  {trustTier.label}
                </span>
              </div>
            )}
            {!isLoading && !trustTier && salesCount === 0 && (
              <div style={{ ...surface({ radius: 'var(--pill)' }), display: 'inline-flex', alignItems: 'center', gap: S[1], padding: '5px 12px', marginTop: S[1] }}>
                <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>New Seller</span>
              </div>
            )}
            {rep && rep.count > 0 && (
              <div style={{ marginTop: S[1] }}>
                <ReputationBadge avg={rep.avg} count={rep.count} />
              </div>
            )}
          </div>

          {/* Stats — all numbers floating in one row, no boxes */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[2], width: '100%', maxWidth: 390 }}>
            {([
              { label: 'Owns',      value: isLoading ? '—' : String(ownedItems.length) },
              { label: 'Listed',    value: isLoading ? '—' : String(listedItems.length) },
              { label: 'Sold',      value: isLoading ? '—' : String(soldItems.length) },
              { label: 'Volume',    value: isLoading ? '—' : `$${totalVolume.toFixed(0)}` },
              { label: 'Followers', value: String(counts?.followers ?? 0), href: `/connections/${profileWallet}?tab=followers` },
              { label: 'Following', value: String(counts?.following ?? 0), href: `/connections/${profileWallet}?tab=following` },
            ] as { label: string; value: string; href?: string }[]).map(s => {
              const inner = (
                <>
                  <div style={{ ...t('title'), color: 'var(--text-strong)' }}>{s.value}</div>
                  <div style={{ ...t('micro'), fontSize: 9, letterSpacing: '0.01em', color: 'var(--text-muted)', marginTop: S[1], whiteSpace: 'nowrap' }}>{s.label}</div>
                </>
              );
              return s.href
                ? <Link key={s.label} href={s.href} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', minWidth: 0 }}>{inner}</Link>
                : <div key={s.label} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>{inner}</div>;
            })}
          </div>

          {isMe && (
            <Link href="/dashboard/seller" style={{ ...btn('primary') }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Sell an Item
            </Link>
          )}

          {!privateMode && myWallet && myWallet !== profileWallet && (
            <div style={{ display: 'flex', gap: S[2], marginTop: S[1], flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={() => isFollowing
                  ? unfollowMut.mutate({ follower_wallet: myWallet, following_wallet: profileWallet })
                  : followMut.mutate({ follower_wallet: myWallet, following_wallet: profileWallet })
                }
                disabled={followMut.isPending || unfollowMut.isPending}
                style={{
                  ...btn(isFollowing ? 'secondary' : 'primary'),
                  opacity: (followMut.isPending || unfollowMut.isPending) ? 0.7 : 1,
                }}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
              <Link href={`/dashboard?msg=${profileWallet}`} style={{ ...btn('secondary') }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Message
              </Link>
              <BlockButton
                viewerWallet={myVisbWallet ?? ''}
                targetWallet={profileWallet}
                getAccessToken={getAccessToken}
              />
              <ReportButton
                targetType="seller"
                targetId={profileWallet}
                reporterWallet={myVisbWallet ?? ''}
                getAccessToken={getAccessToken}
                compact
              />
            </div>
          )}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ ...card(), height: 72, animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        )}

        {!isLoading && (
          <>
            {/* Listed for sale */}
            {listedItems.length > 0 && (
              <div style={{ marginBottom: S[6] }}>
                <div style={{ ...sectionLabel(), marginBottom: S[4] }}>
                  Listed for Sale · {listedItems.length}
                </div>
                <div className="visby-grid">
                  {listedItems.map((item: any) => (
                    <ListingCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}

            {/* Collection (owned, not listed) — private: only the owner sees their own collection */}
            {isMe && unlistedItems.length > 0 && (
              <div style={{ marginBottom: S[6] }}>
                <div style={{ ...sectionLabel(), marginBottom: S[4], display: 'flex', alignItems: 'center', gap: S[2] }}>
                  Collection · {unlistedItems.length}
                  <span style={{ ...t('micro'), color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Private
                  </span>
                </div>
                <div className="visby-grid">
                  {unlistedItems.map((item: any) => (
                    <ListingCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}

            {/* Sold items */}
            {soldItems.length > 0 && (
              <div style={{ marginBottom: S[6] }}>
                <div style={{ ...sectionLabel(), marginBottom: S[4] }}>
                  Sold · {soldItems.length}
                </div>
                <div style={{ ...card(), padding: 0, overflow: 'hidden' }}>
                  {soldItems.map((sale: any, i: number) => (
                    <SoldRow key={sale.id} sale={sale} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {rep && rep.count > 0 && (
              <div style={{ marginBottom: S[6] }}>
                <div style={{ ...sectionLabel(), marginBottom: S[4] }}>
                  {'Reviews · '}{rep.count}
                </div>
                <div style={{ ...card(), padding: S[5], marginBottom: S[4], display: 'flex', flexDirection: 'column', gap: S[4] }}>
                  {/* Average + stars */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[4] }}>
                    <div style={{ ...t('title'), color: 'var(--text-strong)', fontWeight: 700 }}>
                      {rep.avg.toFixed(1)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                      <StarRating value={Math.round(rep.avg)} readOnly />
                      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{rep.count} reviews</div>
                    </div>
                  </div>
                  {/* Breakdown bars 5→1 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                    {([5, 4, 3, 2, 1] as const).map((star) => {
                      const starKey = String(star) as '1' | '2' | '3' | '4' | '5';
                      const count = rep.breakdown?.[starKey] ?? 0;
                      const pct = rep.count > 0 ? Math.round((count / rep.count) * 100) : 0;
                      return (
                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                          <div style={{ ...t('micro'), color: 'var(--text-muted)', width: 8, textAlign: 'right', flexShrink: 0 }}>{star}</div>
                          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-bg)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--text)', transition: 'width .3s ease' }} />
                          </div>
                          <div style={{ ...t('micro'), color: 'var(--text-muted)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <ReviewList reviews={rep.reviews} />
              </div>
            )}

            {/* Empty state */}
            {ownedItems.length === 0 && soldItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <div style={{ ...t('body'), color: 'var(--text-muted)' }}>No activity yet</div>
                {isMe && (
                  <div style={{ marginTop: S[4] }}>
                    <Link href="/mint" style={{ ...btn('primary') }}>Mint your first item</Link>
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
