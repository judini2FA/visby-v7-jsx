'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { t, S, price, card, badge, btn, input, avatar, sectionLabel } from '@/lib/ui';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#25CDB8,#2A8AED)',
  'linear-gradient(135deg,#2A8AED,#BC2DE6)',
  'linear-gradient(135deg,#BC2DE6,#FFC6A3)',
  'linear-gradient(135deg,#22C6B7,#4B93F1)',
  'linear-gradient(135deg,#FFB36B,#BC2DE6)',
  'linear-gradient(135deg,#9BE15D,#22C6B7)',
];

const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '—');

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
    <div style={{ background: 'transparent', minHeight: '100vh' }}>

      {/* Sticky search header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)', padding: `${S[3]}px ${S[4]}px` }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ position: 'relative', marginBottom: S[3] }}>
            <svg style={{ position: 'absolute', left: S[3], top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
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
              style={{ ...input(), paddingLeft: 40, borderColor: sf ? 'var(--text-muted)' : 'var(--glass-border)' }}
            />
          </div>

          {/* Category chips */}
          <div style={{ display: 'flex', gap: S[2], overflowX: 'auto', scrollbarWidth: 'none', marginBottom: S[2] }}>
            {CATS.map(c => (
              <button key={c} onClick={() => setCat(c)} style={{ ...(cat === c ? btn('primary') : btn('secondary')), padding: '6px 14px', flexShrink: 0 }}>
                {c}
              </button>
            ))}
          </div>

          {/* Condition chips */}
          <div style={{ display: 'flex', gap: S[2], overflowX: 'auto', scrollbarWidth: 'none' }}>
            {CONDITIONS.map(c => (
              <button key={c} onClick={() => setCond(c)} style={{ ...btn('secondary'), ...t('meta'), padding: '5px 12px', flexShrink: 0, color: cond === c ? 'var(--text-strong)' : 'var(--text-muted)', borderColor: cond === c ? 'var(--text-muted)' : 'var(--glass-border)' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: `${S[4]}px ${S[3]}px 90px` }}>
        <div style={{ ...sectionLabel(), marginBottom: S[3] }}>
          {isLoading ? 'Searching…' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
        </div>

        {/* Results grid */}
        {!isLoading && filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: `${S[7]}px ${S[5]}px`, gap: S[2] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>No items found</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[5] }}>Try a different search or category</div>
            <Link href="/mint" style={{ ...btn('primary'), textDecoration: 'none' }}>
              Mint First Item
            </Link>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
          {filtered.map((item, i) => (
            <Link key={item.id} href={`/item/${item.id}`} style={{ ...card({ radius: 'var(--r-lg)' }), display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none' }}>
              <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {(item as any).image_url
                  ? <img src={(item as any).image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</span>
                }
                <span style={{ ...badge('onImage'), position: 'absolute', top: S[3], left: S[3] }}>{item.condition}</span>
              </div>
              <div style={{ padding: S[4], display: 'flex', flexDirection: 'column', gap: S[2], flex: 1 }}>
                <div style={{ ...t('heading'), color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                  <div style={{ ...avatar('sm'), width: 22, height: 22, fontSize: 10, background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}>
                    {(item.name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{shortAddr((item as any).current_owner_wallet)}</span>
                </div>
                <div style={{ ...price('md'), marginTop: S[1] }}>${(item.price_usdc ?? 0).toLocaleString()}</div>
              </div>
            </Link>
          ))}
        </div>

        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ ...card({ radius: 'var(--r-lg)' }), height: 240, animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
