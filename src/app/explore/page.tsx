'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

const CATS = ['All', 'Sneakers', 'Watches', 'Bags', 'Memorabilia', 'Vintage', 'Electronics'];
const CONDITIONS = ['All', 'New', 'Like New', 'Excellent', 'Good', 'Fair'];

export default function ExplorePage() {
  const [q, setQ]       = useState('');
  const [cat, setCat]   = useState('All');
  const [cond, setCond] = useState('All');
  const [sf, setSf]     = useState(false);

  const { data: listings, isLoading } = trpc.listings.getListings.useQuery({
    category: cat === 'All' ? undefined : cat,
    limit: 40,
  });

  const filtered = (listings ?? []).filter(l => {
    const matchQ    = !q    || l.name.toLowerCase().includes(q.toLowerCase());
    const matchCond = cond === 'All' || l.condition === cond;
    return matchQ && matchCond;
  });

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Sticky search header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--glass-border)', padding: '12px 16px' }}>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={sf ? 'var(--text)' : 'var(--text-muted)'} strokeWidth="1.8">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => setSf(true)}
            onBlur={() => setSf(false)}
            placeholder="Search Visby…"
            style={{ width: '100%', background: 'var(--field-input-bg)', border: `1px solid ${sf ? 'var(--text-muted)' : 'var(--glass-border)'}`, borderRadius: 14, padding: '11px 14px 11px 40px', color: 'var(--text)', fontSize: 15, outline: 'none', fontFamily: "'Manrope',sans-serif" }}
          />
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 8 }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{ background: cat === c ? GH : 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', border: cat === c ? 'none' : '1px solid var(--glass-border)', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: cat === c ? 700 : 400, color: cat === c ? '#fff' : 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, fontFamily: "'Quicksand', sans-serif" }}>
              {c}
            </button>
          ))}
        </div>

        {/* Condition chips */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {CONDITIONS.map(c => (
            <button key={c} onClick={() => setCond(c)} style={{ background: cond === c ? 'var(--glass-bg-strong)' : 'var(--glass-bg)', border: `1px solid ${cond === c ? 'var(--text-muted)' : 'var(--glass-border)'}`, borderRadius: 20, padding: '5px 12px', fontSize: 11, color: cond === c ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, fontFamily: "'Quicksand', sans-serif" }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px 90px' }}>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", marginBottom: 12 }}>
          {isLoading ? 'Searching…' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
        </div>

        {/* Results grid */}
        {!isLoading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>No items found</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 24 }}>Try a different search or category</div>
            <Link href="/mint" style={{ display: 'inline-block', background: GH, borderRadius: 14, padding: '12px 28px', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              + Mint First Item
            </Link>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {filtered.map((item, i) => (
            <Link key={item.id} href={`/item/${item.id}`} style={{ textDecoration: 'none', background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderRadius: 22, overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', cursor: 'pointer' }}>
              <div style={{ background: ['var(--glass-hairline)','var(--glass-hairline)','var(--glass-hairline)','var(--glass-hairline)','var(--glass-hairline)','var(--glass-hairline)'][i % 6], height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {(item as any).image_url
                  ? <img src={(item as any).image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ fontFamily: "'Quicksand',sans-serif", fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.category}</div>
                }
                <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.92)', border: '1px solid rgba(255,255,255,.18)' }}>{item.condition}</div>
              </div>
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6, lineHeight: 1.3 }}>{item.name}</div>
                <div style={{ fontSize: 17, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  ${(item.price_usdc ?? 0).toLocaleString()}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ background: 'var(--glass-bg)', borderRadius: 22, height: 200, border: '1px solid var(--glass-border)', animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
