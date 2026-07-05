'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { S, t, price, card, sheet, surface, btn, sectionLabel, avatar, input } from '@/lib/ui';
import { LikeButton } from '@/components/like-button';
import { OwnerStack, AvatarCircle } from '@/components/owner-stack';
import { ListingCard } from '@/components/listing-card';
import { PendingSerialCard } from '@/components/pending-serial-card';
import { useCurrency } from '@/lib/currency';
import { HeaderMenu } from '@/components/layout/header-menu';
import { FirstRunOnboarding } from '@/components/first-run-onboarding';

const C = {
  navy: 'transparent',
  teal: '#22C6B7', cyan: '#25CDB8', blue: '#2A8AED', mag: '#BC2DE6',
  muted: 'var(--text-muted)',
  border: 'var(--glass-border)',
};
const GD = `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`;

const AVATAR_GRADS = [
  `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`,
  `linear-gradient(135deg,${C.cyan},${C.teal})`,
  `linear-gradient(135deg,${C.blue},${C.mag})`,
  `linear-gradient(135deg,${C.teal},${C.blue})`,
];

const CATS  = ['All', 'Sneakers', 'Watches', 'Bags', 'Memorabilia', 'Vintage', 'Electronics'];
const COND_OPTS  = ['All', 'New', 'Used'] as const;
const OWNER_OPTS = [
  { key: 'any', label: 'Any' },
  { key: '0',   label: 'None' },
  { key: '1',   label: '1+' },
  { key: '2',   label: '2+' },
  { key: '3',   label: '3+' },
] as const;
const SORTS = [
  { key: 'relevance',  label: 'Relevance' },
  { key: 'newest',     label: 'Newest first' },
  { key: 'popular',    label: 'Trending' },
  { key: 'price_asc',  label: 'Price: low → high' },
  { key: 'price_desc', label: 'Price: high → low' },
] as const;
type Sort = 'relevance' | 'newest' | 'popular' | 'price_asc' | 'price_desc';

function shortAddr(a: string) {
  return a?.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

// Brand mark — intentionally unchanged. Keeps its original Quicksand wordmark + colors.
function VisbyLogo() {
  return (
    <div className="visby-home-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/visby-logo-mark.png" alt="Visby" style={{ height: 28, width: 'auto' }} />
      <svg width="90" height="28" viewBox="0 0 115 32">
        <defs>
          <linearGradient id="vlg-home" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#3EFFD8" />
            <stop offset="50%"  stopColor="#5B9BFF" />
            <stop offset="100%" stopColor="#C742FF" />
          </linearGradient>
        </defs>
        <text x="0" y="26" fontFamily="'Quicksand',sans-serif" fontSize="30" fontWeight="400" fill="url(#vlg-home)" letterSpacing="-1">Visby</text>
      </svg>
    </div>
  );
}

export default function HomePage() {
  const { wallets: solWallets } = useSolanaWallets();
  const myWallet = solWallets?.[0]?.address ?? '';
  const { format: fmtPrice } = useCurrency();
  const router = useRouter();
  const [q,        setQ]        = useState('');
  const [sf,       setSf]       = useState(false);
  const [cat,      setCat]      = useState('All');
  const [newUsed,  setNewUsed]  = useState<typeof COND_OPTS[number]>('All');
  const [ownersF,  setOwnersF]  = useState<typeof OWNER_OPTS[number]['key']>('any');
  const [sort,     setSort]     = useState<Sort>('newest');
  const [minP,     setMinP]     = useState('');
  const [maxP,     setMaxP]     = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [browse,   setBrowse]   = useState<'products' | 'sellers' | 'brands'>('products');

  // Debounce the typed query so synonym expansion + DB search don't fire per keystroke.
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const tm = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(tm);
  }, [q]);

  const { data: raw = [], isLoading } = trpc.listings.getListings.useQuery({
    category:  cat  === 'All' ? undefined : cat,
    minPrice:  minP ? parseFloat(minP) : undefined,
    maxPrice:  maxP ? parseFloat(maxP) : undefined,
    sort: sort === 'relevance' ? 'newest' : sort,
    search: debouncedQ || undefined,
    limit: 80,
  }, { enabled: browse === 'products' });

  // Unminted business inventory (pending_serials) — merged into the same grid as minted listings.
  // Not wired into the 3-tier search (semantic/Orama/ilike) yet, so it only shows when there's no
  // active search query — searching should never surface a row search can't actually rank.
  const { data: pendingRaw = [], isLoading: pendingLoading } = trpc.listings.getAvailablePending.useQuery(
    { limit: 80 },
    { enabled: browse === 'products' && !debouncedQ },
  );

  // Seller (profile) search — the same search bar pulls up profiles when the Sellers filter is on.
  const { data: suggestedSellers = [] } = trpc.follows.getSuggested.useQuery(
    { wallet: myWallet || undefined },
    { enabled: browse === 'sellers' && !debouncedQ },
  );
  const { data: searchedSellers = [], isLoading: sellersSearching } = trpc.profiles.searchProfiles.useQuery(
    { query: debouncedQ },
    { enabled: browse === 'sellers' && !!debouncedQ },
  );
  const sellers = debouncedQ ? searchedSellers : suggestedSellers;

  const items = useMemo(() => {
    // Merge minted listings with pending (unminted) business inventory. Pending rows have no
    // `owners`/`current_owner_wallet` — normalize them here (owners: [], business_wallet stands in
    // for current_owner_wallet) so the shared filters below can treat every row the same way without
    // each filter needing its own kind-check.
    const mintedNormalized = raw.map(i => ({ ...i, kind: 'minted' as const }));
    const pendingNormalized = pendingRaw.map(p => ({
      ...p,
      kind: 'pending' as const,
      current_owner_wallet: p.business_wallet,
      owners: [] as { wallet: string; avatar_url?: string | null }[],
      description: null as string | null,
    }));
    let list: (typeof mintedNormalized[number] | typeof pendingNormalized[number])[] =
      [...mintedNormalized, ...pendingNormalized];

    if (newUsed !== 'All') {
      list = list.filter(i => {
        const isNew = (i.condition ?? '').toLowerCase() === 'new';
        return newUsed === 'New' ? isNew : !isNew;
      });
    }

    if (ownersF !== 'any') {
      const min = parseInt(ownersF, 10);
      list = list.filter(i => {
        // Pending (unminted) rows have no ownership chain yet — they only pass the "0 previous
        // owners" filter, never a "1+" etc. one, since nobody has ever owned them.
        if (i.kind === 'pending') return ownersF === '0';
        const o = (i as any).owners;
        const prev = Array.isArray(o) && o.length ? Math.max(0, o.length - 1) : ((i as any).transfer_count ?? 0);
        return ownersF === '0' ? prev === 0 : prev >= min;
      });
    }

    // Price range applies to pending rows too (already server-filtered for minted via getListings,
    // but getAvailablePending doesn't take min/max, so enforce it client-side here).
    const minPn = minP ? parseFloat(minP) : undefined;
    const maxPn = maxP ? parseFloat(maxP) : undefined;
    if (minPn != null || maxPn != null) {
      list = list.filter(i => {
        if (i.kind !== 'pending') return true; // minted rows already server-filtered
        const p = i.price_usdc ?? 0;
        if (minPn != null && p < minPn) return false;
        if (maxPn != null && p > maxPn) return false;
        return true;
      });
    }

    if (sort === 'relevance' && debouncedQ) {
      const lq = debouncedQ.toLowerCase();
      list = [...list].sort((a, b) => {
        const score = (i: typeof a) => {
          const nl = i.name.toLowerCase();
          if (nl.startsWith(lq)) return 100;
          if (nl.includes(lq)) return 70;
          if ((i.category ?? '').toLowerCase().includes(lq)) return 40;
          if ((i.description ?? '').toLowerCase().includes(lq)) return 20;
          return 0;
        };
        return score(b) - score(a);
      });
    } else if (sort === 'price_asc') {
      list = [...list].sort((a, b) => (a.price_usdc ?? 0) - (b.price_usdc ?? 0));
    } else if (sort === 'price_desc') {
      list = [...list].sort((a, b) => (b.price_usdc ?? 0) - (a.price_usdc ?? 0));
    } else if (sort === 'newest') {
      // Minted rows come pre-sorted newest-first from getListings, pending rows from
      // getAvailablePending — interleave both by created_at so newest overall leads regardless of kind.
      list = [...list].sort((a, b) => {
        const at = (a as any).created_at ? new Date((a as any).created_at).getTime() : 0;
        const bt = (b as any).created_at ? new Date((b as any).created_at).getTime() : 0;
        return bt - at;
      });
    }
    // 'popular' sort is minted-only (view_count); pending rows keep their newest-first server order,
    // trailing after the popularity-sorted minted rows since list order is otherwise untouched here.

    return list;
  }, [raw, pendingRaw, debouncedQ, sort, newUsed, ownersF, minP, maxP]);

  const hasFilters = cat !== 'All' || newUsed !== 'All' || ownersF !== 'any' || !!minP || !!maxP;
  function clearFilters() { setCat('All'); setNewUsed('All'); setOwnersF('any'); setMinP(''); setMaxP(''); }

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      <FirstRunOnboarding />

      {/* ── Top nav ──────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--glass-bg-strong)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
        boxShadow: '0 4px 20px rgba(0,0,0,.08)',
      }}>
        <div className="visby-page" style={{ paddingTop: 10, paddingBottom: 0 }}>
          {/* Row 1: spacer | logo centered | hamburger right */}
          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 10 }}>
            <div style={{ flex: 1 }} />
            <VisbyLogo />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <HeaderMenu />
            </div>
          </div>

          {/* Row 2: full-width search */}
          <div style={{ paddingBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke={sf ? 'var(--text)' : 'var(--text-muted)'} strokeWidth="1.8">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onFocus={() => setSf(true)}
                onBlur={() => setSf(false)}
                placeholder={browse === 'sellers' ? 'Search sellers by name or wallet…' : browse === 'brands' ? 'Search brands…' : 'Search items, brands, serials…'}
                style={{
                  ...input(),
                  paddingLeft: 40,
                  borderColor: sf ? 'var(--text-muted)' : 'var(--glass-border)',
                  transition: 'border-color .2s',
                }}
              />
              {q && (
                <button onClick={() => setQ('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="visby-page">

        {/* ── Browse row: Products · Sellers · Brands + Filters ── */}
        <div style={{ marginTop: S[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: S[3] }}>
            <button onClick={() => setFiltersOpen(true)}
              style={{ ...btn('secondary'), padding: '6px 13px', fontSize: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, ...(hasFilters ? { borderColor: 'var(--text-muted)', color: 'var(--text-strong)' } : { color: 'var(--text-muted)' }) }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              Filters{hasFilters ? ' ·' : ''}
            </button>
            {browse !== 'products' && (
              <button onClick={() => setBrowse('products')}
                style={{ ...btn('primary'), padding: '6px 13px', fontSize: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {browse === 'sellers' ? 'Sellers' : 'Brands'}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Filters popup ────────────────────────────── */}
        {filtersOpen && (
          <>
            <div onClick={() => setFiltersOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--modal-scrim)' }} />
            <div style={{ ...sheet({ radius: '30px 30px 0 0' }), position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 600, zIndex: 201, borderBottom: 'none', padding: `0 ${S[5]}px ${S[6]}px`, maxHeight: '88vh', overflowY: 'auto' }}>
              <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2, margin: `${S[4]}px auto ${S[5]}px` }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[5] }}>
                <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Filters</div>
                {hasFilters && (
                  <button onClick={clearFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', ...t('meta'), color: 'var(--danger)', fontWeight: 700 }}>Clear all</button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
                {/* Browse: toggle what the search bar pulls up — products, sellers, or brands */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Browse</div>
                  <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                    {([
                      { key: 'products', label: 'Products', icon: <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/> },
                      { key: 'sellers',  label: 'Sellers',  icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
                      { key: 'brands',   label: 'Brands',   icon: <><path d="M3 9l1.5-5h15L21 9"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M9 22v-7h6v7"/></> },
                    ] as { key: 'products' | 'sellers' | 'brands'; label: string; icon: JSX.Element }[]).map(b => (
                      <button key={b.key} onClick={() => { setBrowse(b.key); setFiltersOpen(false); }}
                        style={{ ...btn(browse === b.key ? 'primary' : 'secondary'), padding: '6px 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, ...(browse === b.key ? {} : { color: 'var(--text-muted)' }) }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{b.icon}</svg>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Category</div>
                  <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                    {CATS.map(c => (
                      <button key={c} onClick={() => setCat(c)}
                        style={{ ...btn(cat === c ? 'primary' : 'secondary'), padding: '6px 13px', fontSize: 12 }}>{c}</button>
                    ))}
                  </div>
                </div>

                {/* New / Used */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Condition</div>
                  <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                    {COND_OPTS.map(c => (
                      <button key={c} onClick={() => setNewUsed(c)}
                        style={{ ...btn(newUsed === c ? 'primary' : 'secondary'), padding: '6px 13px', fontSize: 12 }}>{c}</button>
                    ))}
                  </div>
                </div>

                {/* Sort / price filtering */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Sort by</div>
                  <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                    {SORTS.filter(s => s.key !== 'relevance').map(s => (
                      <button key={s.key} onClick={() => setSort(s.key as Sort)}
                        style={{ ...btn(sort === s.key ? 'primary' : 'secondary'), padding: '6px 13px', fontSize: 12 }}>{s.label}</button>
                    ))}
                  </div>
                </div>

                {/* Price range */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Price range (USDC)</div>
                  <div style={{ display: 'flex', gap: S[3], alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: S[3], top: '50%', transform: 'translateY(-50%)', ...t('body'), color: 'var(--text-muted)' }}>$</span>
                      <input type="number" inputMode="decimal" value={minP} onChange={e => setMinP(e.target.value)} placeholder="Min"
                        style={{ ...input(), background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', paddingLeft: S[6] }} />
                    </div>
                    <span style={{ ...t('body'), color: 'var(--text-muted)' }}>—</span>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: S[3], top: '50%', transform: 'translateY(-50%)', ...t('body'), color: 'var(--text-muted)' }}>$</span>
                      <input type="number" inputMode="decimal" value={maxP} onChange={e => setMaxP(e.target.value)} placeholder="Max"
                        style={{ ...input(), background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', paddingLeft: S[6] }} />
                    </div>
                  </div>
                </div>

                {/* Previous owners */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Previous owners</div>
                  <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                    {OWNER_OPTS.map(o => (
                      <button key={o.key} onClick={() => setOwnersF(o.key)}
                        style={{ ...btn(ownersF === o.key ? 'primary' : 'secondary'), padding: '6px 13px', fontSize: 12 }}>{o.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={() => setFiltersOpen(false)} style={{ ...btn('primary', { full: true, pill: false }), marginTop: S[6] }}>
                Show {items.length} result{items.length !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* ── Results ──────────────────────────────────── */}
        {browse === 'products' && (<>
        <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[3] }}>
          {isLoading ? 'Searching…' : `${items.length} item${items.length !== 1 ? 's' : ''} for sale`}
        </div>
        <div style={{ paddingBottom: 100 }}>

          {/* Skeletons */}
          {isLoading && (
            <div className="visby-grid">
              {[1,2,3,4].map(i => (
                <div key={i} style={{ ...card({ radius: 'var(--r-lg)' }), height: 240, animation: 'pulse 2s infinite' }} />
              ))}
            </div>
          )}

          {/* Empty */}
          {!isLoading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: `${S[7]}px ${S[5]}px` }}>
              <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[2] }}>No listings yet</div>
              <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[5] }}>Be the first to mint an item on Visby</div>
              <Link href="/mint" style={btn('primary')}>
                Mint First Item
              </Link>
            </div>
          )}

          {/* Cards — minted listings render as ListingCard, pending business inventory as
              PendingSerialCard; key is prefixed by kind so a minted item and a pending row can never
              collide even if their ids coincided. */}
          {!isLoading && items.length > 0 && (
            <div className="visby-grid">
              {items.map((item) => (
                item.kind === 'pending'
                  ? <PendingSerialCard key={`pending:${item.id}`} item={item as any} />
                  : <ListingCard key={`minted:${item.id}`} item={item as any} />
              ))}
            </div>
          )}
        </div>
        </>)}

        {/* Sellers (profiles) — the same search bar pulls up profiles in this mode */}
        {browse === 'sellers' && (
          <div style={{ paddingBottom: 100 }}>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[3] }}>
              {sellersSearching ? 'Searching…' : debouncedQ ? `${sellers.length} seller${sellers.length !== 1 ? 's' : ''}` : 'Suggested sellers'}
            </div>
            {!sellersSearching && sellers.length === 0 && (
              <div style={{ textAlign: 'center', padding: `${S[7]}px ${S[5]}px`, ...t('meta'), color: 'var(--text-muted)' }}>
                {debouncedQ ? `No sellers found for "${debouncedQ}"` : 'Search for a seller by name or wallet'}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
              {sellers.map((p: any) => (
                <Link key={p.wallet} href={`/p/${p.wallet}`} style={{ ...surface({ pad: S[4] }), display: 'flex', alignItems: 'center', gap: S[3], textDecoration: 'none' }}>
                  <AvatarCircle wallet={p.wallet} avatarUrl={p.avatar_url} size={48} ring="transparent" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.display_name || shortAddr(p.wallet)}
                    </div>
                    <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.listing_count > 0 ? `${p.listing_count} listing${p.listing_count !== 1 ? 's' : ''} · ` : ''}{shortAddr(p.wallet)}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Brands — placeholder until brand profiles exist */}
        {browse === 'brands' && (
          <div style={{ textAlign: 'center', padding: `${S[7]}px ${S[5]}px`, paddingBottom: 100 }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[2] }}>Brands are coming soon</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Soon you&apos;ll be able to find and follow your favorite brands here.</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  );
}
