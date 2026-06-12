'use client';

import { Suspense } from 'react';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { t, S, price, card, sheet, surface, btn, badge, sectionLabel, avatar, input } from '@/lib/ui';

const C = {
  cyan: '#6DE4D5', teal: '#5ED9D1', blue: '#59B4F5', mag: '#D54AF2',
};

const CATS   = ['All', 'Sneakers', 'Watches', 'Bags', 'Memorabilia', 'Vintage', 'Electronics'];
const CONDS  = ['All', 'New', 'Like New', 'Excellent', 'Good', 'Fair'];
const SORTS  = [
  { key: 'relevance',  label: 'Relevance' },
  { key: 'newest',     label: 'Newest first' },
  { key: 'price_asc',  label: 'Price: low → high' },
  { key: 'price_desc', label: 'Price: high → low' },
] as const;

type Sort = 'relevance' | 'newest' | 'price_asc' | 'price_desc';

function shortAddr(a: string) {
  return a?.length > 10 ? `${a.slice(0,4)}…${a.slice(-4)}` : a;
}

function MarketplaceInner() {
  const params = useSearchParams();
  const [q,       setQ]       = useState(params.get('q') ?? '');
  const [cat,     setCat]     = useState('All');
  const [cond,    setCond]    = useState('All');
  const [sort,    setSort]    = useState<Sort>('newest');
  const [minP,    setMinP]    = useState('');
  const [maxP,    setMaxP]    = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sf,      setSf]      = useState(false);

  // Debounce the typed query so synonym expansion + DB search don't fire per keystroke.
  const [debouncedQ, setDebouncedQ] = useState(q.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const { data: raw = [], isLoading } = trpc.listings.getListings.useQuery({
    category:  cat  === 'All'  ? undefined : cat,
    condition: cond === 'All'  ? undefined : cond,
    minPrice:  minP ? parseFloat(minP) : undefined,
    maxPrice:  maxP ? parseFloat(maxP) : undefined,
    sort: sort === 'relevance' ? 'newest' : sort,
    search: debouncedQ || undefined,
    limit: 80,
  });

  // Exact matches on the typed term rank above synonym-only matches.
  const items = useMemo(() => {
    if (sort !== 'relevance' || !debouncedQ) return raw;
    const lq = debouncedQ.toLowerCase();
    return [...raw].sort((a, b) => {
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
  }, [raw, debouncedQ, sort]);

  const hasFilters = cat !== 'All' || cond !== 'All' || minP || maxP;

  function clearFilters() {
    setCat('All'); setCond('All'); setMinP(''); setMaxP('');
  }

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* ── Sticky header ─────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-page" style={{ paddingTop: 0, paddingBottom: 0 }}>

          {/* Top row: title */}
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: S[3], paddingBottom: S[3] }}>
            <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Search</div>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', paddingBottom: S[3] }}>
            <svg style={{ position: 'absolute', left: S[4], top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sf ? 'var(--text)' : 'var(--text-muted)'} strokeWidth="1.8">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={q} onChange={e => setQ(e.target.value)}
              onFocus={() => setSf(true)} onBlur={() => setSf(false)}
              placeholder="Search items, brands, serial numbers…"
              style={{ ...input(), paddingLeft: S[7], borderColor: sf ? 'var(--text-muted)' : 'var(--glass-border)', transition: 'border-color .2s' }} />
            {q && (
              <button onClick={() => setQ('')} style={{ position: 'absolute', right: S[4], top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            )}
          </div>

          {/* Category chips */}
          <div style={{ display: 'flex', gap: S[2], overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: S[3] }}>
            {CATS.map(c => (
              <button key={c} onClick={() => setCat(c)}
                style={{ ...btn(cat === c ? 'primary' : 'secondary'), padding: '6px 14px', fontSize: 12, flexShrink: 0 }}>
                {c}
              </button>
            ))}
          </div>

          {/* Filter toggle + active chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], paddingBottom: S[3] }}>
            <button onClick={() => setFiltersOpen(o => !o)}
              style={{ ...btn('secondary'), padding: '6px 13px', fontSize: 12, ...(filtersOpen ? { borderColor: 'var(--text-muted)', color: 'var(--text-strong)' } : { color: 'var(--text-muted)' }) }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              Filters {hasFilters ? '·' : ''}
            </button>
            {hasFilters && (
              <button onClick={clearFilters} style={{ ...btn('danger'), padding: '6px 13px', fontSize: 12 }}>
                Clear
              </button>
            )}
          </div>

          {/* Collapsible filter panel */}
          {filtersOpen && (
            <div style={{ paddingBottom: S[4] }}>
              <div style={{ ...sheet({ radius: 'var(--r-lg)' }), padding: S[4], marginBottom: S[3], display: 'flex', flexDirection: 'column', gap: S[5] }}>
                {/* Sort by — first in panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Sort by</div>
                  <select value={sort} onChange={e => setSort(e.target.value as Sort)}
                    style={{ ...surface({ radius: 'var(--r-sm)', pad: '12px 16px' }), ...t('body'), color: 'var(--text)', outline: 'none', cursor: 'pointer', width: '100%' }}>
                    {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>

                {/* Condition */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Condition</div>
                  <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                    {CONDS.map(c => (
                      <button key={c} onClick={() => setCond(c)}
                        style={{ ...btn(cond === c ? 'primary' : 'secondary'), padding: '6px 13px', fontSize: 12 }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price range */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={sectionLabel()}>Price Range (USDC)</div>
                  <div style={{ display: 'flex', gap: S[3], alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: S[3], top: '50%', transform: 'translateY(-50%)', ...t('body'), color: 'var(--text-muted)' }}>$</span>
                      <input type="number" value={minP} onChange={e => setMinP(e.target.value)} placeholder="Min"
                        style={{ ...input(), background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', paddingLeft: S[6] }} />
                    </div>
                    <span style={{ ...t('body'), color: 'var(--text-muted)' }}>—</span>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: S[3], top: '50%', transform: 'translateY(-50%)', ...t('body'), color: 'var(--text-muted)' }}>$</span>
                      <input type="number" value={maxP} onChange={e => setMaxP(e.target.value)} placeholder="Max"
                        style={{ ...input(), background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', paddingLeft: S[6] }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Results ───────────────────────────────────── */}
      <div className="visby-page" style={{ padding: `${S[4]}px 12px 100px` }}>

        {/* Count */}
        <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>
          {isLoading ? 'Searching…' : `${items.length} item${items.length !== 1 ? 's' : ''} for sale`}
        </div>

        {/* Skeleton */}
        {isLoading && (
          <div className="visby-grid">
            {[1,2,3,4].map(i => (
              <div key={i} style={{ ...card({ radius: 'var(--r-lg)' }), height: 240, animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: `${S[7]}px ${S[5]}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2] }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: S[2] }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>
              {q || hasFilters ? 'No items match your search' : 'Nothing for sale yet'}
            </div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>
              {q || hasFilters ? 'Try clearing filters or a different search' : 'Be the first to list something'}
            </div>
            <div style={{ display: 'flex', gap: S[3], flexWrap: 'wrap', justifyContent: 'center' }}>
              {hasFilters && (
                <button onClick={clearFilters} style={btn('primary')}>
                  Clear Filters
                </button>
              )}
              <Link href="/mint" style={btn('secondary')}>
                List an Item
              </Link>
            </div>
          </div>
        )}

        {/* Grid */}
        {!isLoading && items.length > 0 && (
          <div className="visby-grid">
            {items.map((item, i) => {
              const gradients = [
                `linear-gradient(135deg,${C.cyan},${C.blue})`,
                `linear-gradient(135deg,${C.teal},${C.blue})`,
                `linear-gradient(135deg,${C.blue},${C.mag})`,
                `linear-gradient(135deg,${C.cyan},${C.teal})`,
              ];
              const sellerInit = (item.current_owner_wallet[0] ?? '?').toUpperCase();
              return (
                <Link key={item.id} href={`/item/${item.id}`}
                  style={{ ...card({ radius: 'var(--r-lg)' }), display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none' }}>

                  {/* Image */}
                  <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(item as any).image_url
                      ? <img src={(item as any).image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</span>
                    }
                    <span style={{ ...badge('onImage'), position: 'absolute', top: S[3], left: S[3] }}>{item.condition}</span>
                  </div>

                  {/* Info */}
                  <div style={{ padding: S[4], display: 'flex', flexDirection: 'column', gap: S[2], flex: 1 }}>
                    <div style={{ ...t('heading'), color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.name}
                    </div>
                    {/* Seller */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                      <div style={{ ...avatar('sm'), width: 22, height: 22, fontSize: 10, background: gradients[i % gradients.length] }}>
                        {sellerInit}
                      </div>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shortAddr(item.current_owner_wallet)}
                      </span>
                    </div>
                    {/* Price */}
                    <div style={{ ...price('md'), marginTop: S[1] }}>
                      ${(item.price_usdc ?? 0).toLocaleString()}
                    </div>
                  </div>
                </Link>
              );
            })}
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

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div style={{ background: 'transparent', minHeight: '100vh' }} />}>
      <MarketplaceInner />
    </Suspense>
  );
}
