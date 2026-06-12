'use client';

import { Suspense } from 'react';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const CAT_BG: Record<string, string> = {
  Sneakers: 'var(--glass-hairline)', Watches: 'var(--glass-hairline)', Bags: 'var(--glass-hairline)',
  Memorabilia: 'var(--glass-hairline)', Vintage: 'var(--glass-hairline)', Electronics: 'var(--glass-hairline)', Other: 'var(--glass-hairline)',
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
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 12, paddingBottom: 10 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-strong)' }}>Search</div>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', paddingBottom: 10 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-60%)', pointerEvents: 'none' }}
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={sf ? 'var(--text)' : 'var(--text-muted)'} strokeWidth="1.8">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={q} onChange={e => setQ(e.target.value)}
              onFocus={() => setSf(true)} onBlur={() => setSf(false)}
              placeholder="Search items, brands, serial numbers…"
              style={{ width: '100%', background: 'var(--field-input-bg)', border: `1px solid ${sf ? 'var(--text-muted)' : 'var(--glass-border)'}`, borderRadius: 14, padding: '11px 14px 11px 38px', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: "'Manrope',sans-serif", transition: 'border-color .2s' }} />
            {q && (
              <button onClick={() => setQ('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-60%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            )}
          </div>

          {/* Category chips */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 10 }}>
            {CATS.map(c => (
              <button key={c} onClick={() => setCat(c)}
                style={{ background: cat === c ? GH : 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: `1px solid ${cat === c ? 'transparent' : 'var(--glass-border)'}`, borderRadius: 'var(--pill)', padding: '6px 14px', fontSize: 12, fontWeight: cat === c ? 700 : 500, color: cat === c ? '#fff' : 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, fontFamily: "'Quicksand',sans-serif" }}>
                {c}
              </button>
            ))}
          </div>

          {/* Filter toggle + active chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12 }}>
            <button onClick={() => setFiltersOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: filtersOpen ? 'var(--glass-bg-strong)' : 'var(--glass-bg)', border: `1px solid ${filtersOpen ? 'var(--text-muted)' : C.border}`, borderRadius: 'var(--pill)', padding: '6px 13px', fontSize: 12, color: filtersOpen ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              Filters {hasFilters ? '·' : ''}
            </button>
            {hasFilters && (
              <button onClick={clearFilters}
                style={{ background: 'rgba(255,59,92,.12)', border: '1px solid rgba(255,59,92,.25)', borderRadius: 'var(--pill)', padding: '5px 11px', fontSize: 11, color: '#FF3B5C', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
                Clear
              </button>
            )}
          </div>

          {/* Collapsible filter panel */}
          {filtersOpen && (
            <div style={{ paddingBottom: 14, borderTop: `1px solid var(--divider)` }}>
              <div style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
                WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
                border: '1px solid var(--glass-border)',
                borderRadius: 20,
                boxShadow: 'var(--glass-shadow), var(--glass-inner)',
                padding: 16,
                marginTop: 12,
                marginBottom: 12,
              }}>
                {/* Sort by — first in panel */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Sort by</div>
                  <select value={sort} onChange={e => setSort(e.target.value as Sort)}
                    style={{ width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: "'Manrope',sans-serif", cursor: 'pointer' }}>
                    {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>

                {/* Condition */}
                <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Quicksand',sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Condition</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
                  {CONDS.map(c => (
                    <button key={c} onClick={() => setCond(c)}
                      style={{ background: cond === c ? 'var(--glass-bg-strong)' : 'var(--glass-bg)', border: `1px solid ${cond === c ? 'var(--text-muted)' : C.border}`, borderRadius: 'var(--pill)', padding: '5px 12px', fontSize: 11, color: cond === c ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
                      {c}
                    </button>
                  ))}
                </div>

                {/* Price range */}
                <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Quicksand',sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Price Range (USDC)</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>$</span>
                    <input type="number" value={minP} onChange={e => setMinP(e.target.value)} placeholder="Min"
                      style={{ width: '100%', background: 'var(--field-input-bg)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 10px 9px 22px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: "'Manrope',sans-serif" }} />
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>$</span>
                    <input type="number" value={maxP} onChange={e => setMaxP(e.target.value)} placeholder="Max"
                      style={{ width: '100%', background: 'var(--field-input-bg)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 10px 9px 22px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: "'Manrope',sans-serif" }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Results ───────────────────────────────────── */}
      <div className="visby-page" style={{ padding: '14px 12px 100px' }}>

        {/* Count */}
        <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", marginBottom: 14 }}>
          {isLoading ? 'Searching…' : `${items.length} item${items.length !== 1 ? 's' : ''} for sale`}
        </div>

        {/* Skeleton */}
        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ background: 'var(--glass-bg)', borderRadius: 'var(--r)', height: 240, border: '1px solid var(--glass-border)', animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
              {q || hasFilters ? 'No items match your search' : 'Nothing for sale yet'}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 24 }}>
              {q || hasFilters ? 'Try clearing filters or a different search' : 'Be the first to list something'}
            </div>
            {hasFilters && (
              <button onClick={clearFilters} style={{ background: GH, border: 'none', borderRadius: 12, padding: '11px 24px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", marginRight: 10 }}>
                Clear Filters
              </button>
            )}
            <Link href="/mint" style={{ display: 'inline-block', background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 24px', color: 'var(--text)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
              List an Item
            </Link>
          </div>
        )}

        {/* Grid */}
        {!isLoading && items.length > 0 && (
          <div className="visby-grid">
            {items.map((item, i) => {
              const bg = CAT_BG[item.category] ?? CAT_BG.Other;
              const gradients = [
                `linear-gradient(135deg,${C.cyan},${C.blue})`,
                `linear-gradient(135deg,${C.teal},${C.blue})`,
                `linear-gradient(135deg,${C.blue},${C.mag})`,
                `linear-gradient(135deg,${C.cyan},${C.teal})`,
              ];
              const sellerInit = (item.current_owner_wallet[0] ?? '?').toUpperCase();
              return (
                <Link key={item.id} href={`/item/${item.id}`}
                  style={{ textDecoration: 'none', background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', display: 'flex', flexDirection: 'column' }}>

                  {/* Image */}
                  <div style={{ background: 'var(--glass-hairline)', height: 140, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {(item as any).image_url
                      ? <img src={(item as any).image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontFamily: "'Quicksand',sans-serif", fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.category}</span>
                    }
                    {/* Condition pill */}
                    <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)', borderRadius: 6, padding: '2px 7px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.1)' }}>
                      {item.condition}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '10px 11px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {item.name}
                    </div>
                    {/* Seller */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: gradients[i % gradients.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {sellerInit}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Quicksand',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shortAddr(item.current_owner_wallet)}
                      </span>
                    </div>
                    {/* Price */}
                    <div style={{ marginTop: 'auto', paddingTop: 6, fontSize: 16, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      ${(item.price_usdc ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
