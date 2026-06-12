'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { ThemeToggle, useTheme } from '@/lib/theme';

const C = {
  navy: 'transparent',
  teal: '#5ED9D1', cyan: '#6DE4D5', blue: '#59B4F5', mag: '#D54AF2',
  muted: 'var(--text-muted)',
  border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const GD = `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`;

const AVATAR_GRADS = [
  `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`,
  `linear-gradient(135deg,${C.cyan},${C.teal})`,
  `linear-gradient(135deg,${C.blue},${C.mag})`,
  `linear-gradient(135deg,${C.teal},${C.blue})`,
];

function shortAddr(a: string) {
  return a?.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

// Brand mark — intentionally unchanged. Keeps its original Quicksand wordmark + colors.
function VisbyLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets: solWallets } = useSolanaWallets();
  const myWallet = solWallets?.[0]?.address ?? '';
  const { mode } = useTheme();
  const router = useRouter();
  const [q,        setQ]        = useState('');
  const [sf,       setSf]       = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: raw = [], isLoading } = trpc.listings.getListings.useQuery({
    limit: 80,
  });

  const { data: following = [] } = trpc.follows.getFollowing.useQuery(
    { wallet: myWallet },
    { enabled: !!myWallet }
  );

  const items = useMemo(() => {
    if (!q) return raw;
    const lq = q.toLowerCase();
    return raw.filter(i =>
      i.name.toLowerCase().includes(lq) ||
      i.serial_number.toLowerCase().includes(lq) ||
      i.category.toLowerCase().includes(lq)
    );
  }, [raw, q]);

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* ── Top nav ──────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--glass-bg-strong)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
        borderBottom: '1px solid var(--divider)',
        boxShadow: '0 2px 16px rgba(0,0,0,.06)',
      }}>
        <div className="visby-page" style={{ paddingTop: 10, paddingBottom: 0 }}>
          {/* Row 1: spacer | logo centered | hamburger right */}
          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 10 }}>
            <div style={{ flex: 1 }} />
            <VisbyLogo />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMenuOpen(true)}
                style={{
                  background: 'var(--glass-bg)',
                  backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 14, padding: '9px 11px',
                  cursor: 'pointer', flexShrink: 0,
                  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center',
                }}
              >
                {[0,1,2].map(i => <div key={i} style={{ width: 18, height: 1.5, background: 'var(--text)', borderRadius: 1 }} />)}
              </button>
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
                placeholder="Search items, brands, serials…"
                style={{
                  width: '100%',
                  background: 'var(--field-input-bg)',
                  border: `1px solid ${sf ? 'var(--text-muted)' : 'var(--glass-border)'}`,
                  borderRadius: 14, padding: '9px 12px 9px 36px',
                  color: 'var(--text)', fontSize: 14, outline: 'none',
                  fontFamily: "'Manrope',sans-serif", transition: 'border-color .2s',
                }}
              />
              {q && (
                <button onClick={() => setQ('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Menu sheet ───────────────────────────────────── */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 600, zIndex: 201, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', borderRadius: '30px 30px 0 0', border: '1px solid var(--glass-border)', borderBottom: 'none', boxShadow: 'var(--glass-shadow)', padding: '0 20px 48px' }}>
            <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2, margin: '16px auto 24px' }} />

            {/* Appearance / theme toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 4px 18px', borderBottom: '1px solid var(--divider)', marginBottom: 6 }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-strong)', fontFamily: "'Quicksand',sans-serif" }}>Appearance</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mode === 'dark' ? 'Night' : 'Day'} mode</span>
              </div>
              <div style={{ marginLeft: 'auto' }}><ThemeToggle /></div>
            </div>

            {([
              { label: 'Profile',       href: '/profile',           icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
              { label: 'Notifications', href: '/dashboard',         icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
              { label: 'Liked Items',   href: '/liked',             icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
              { label: 'Sell an Item',  href: '/dashboard/seller',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> },
              { label: 'Settings',      href: '/settings',          icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
            ] as const).map(item => (
              <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', borderBottom: '1px solid var(--divider)', textDecoration: 'none' }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-strong)', fontFamily: "'Quicksand',sans-serif" }}>{item.label}</span>
                <svg style={{ marginLeft: 'auto' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            ))}
            <div style={{ marginTop: 20 }}>
              {ready && (authenticated
                ? <button onClick={() => { logout(); setMenuOpen(false); }} style={{ width: '100%', background: 'rgba(255,59,92,.10)', border: '1px solid rgba(255,59,92,.28)', borderRadius: 16, padding: '14px', color: '#FF3B5C', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>Sign Out</button>
                : <button onClick={() => { login(); setMenuOpen(false); }} style={{ width: '100%', background: GH, border: 'none', borderRadius: 16, padding: '14px', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>Sign In</button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="visby-page">

        {/* ── Stories ──────────────────────────────────── */}
        <div style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
          WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--glass-shadow), var(--glass-inner)',
          padding: '8px 12px',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingTop: 4, paddingBottom: 4, scrollbarWidth: 'none' }}>
            {/* Sell/Mint button — always first */}
            <Link href="/mint" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, textDecoration: 'none' }}>
              <div style={{ padding: 0, background: 'transparent', borderRadius: '50%', border: `2px dashed var(--glass-border)` }}>
                <div style={{ padding: 0, background: 'var(--bg-0)', borderRadius: '50%' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--glass-bg-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>+</div>
                </div>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 56, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sell</span>
            </Link>

            {following.map((f, i) => {
              const initials = f.display_name
                ? f.display_name.slice(0, 2).toUpperCase()
                : f.wallet.slice(0, 2).toUpperCase();
              const hasNew = !!f.latest_listing_at && !!f.followed_at && f.latest_listing_at > f.followed_at;
              const grad = AVATAR_GRADS[i % AVATAR_GRADS.length];
              return (
                <Link key={f.wallet} href={`/p/${f.wallet}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, textDecoration: 'none' }}>
                  <div style={{
                    padding: 2,
                    background: hasNew ? GD : 'var(--glass-border)',
                    borderRadius: '50%',
                    border: hasNew ? '2px solid transparent' : '2px solid var(--glass-border)',
                    boxShadow: 'none',
                  }}>
                    <div style={{ padding: 2.5, background: 'var(--bg-0)', borderRadius: '50%' }}>
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff' }}>
                        {initials}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 56, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.display_name ?? shortAddr(f.wallet)}
                  </span>
                </Link>
              );
            })}

            {following.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 60, opacity: 0.5 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>Follow sellers to see them here</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Grid ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recommended</span>
          <Link href="/marketplace" style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            See all
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        </div>
        <div style={{ paddingBottom: 100 }}>

          {/* Skeletons */}
          {isLoading && (
            <div className="visby-grid">
              {[1,2,3,4].map(i => (
                <div key={i} style={{ background: 'var(--glass-bg)', borderRadius: 'var(--r-lg)', height: 240, border: '1px solid var(--glass-border)', animation: 'pulse 2s infinite' }} />
              ))}
            </div>
          )}

          {/* Empty */}
          {!isLoading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 6, fontWeight: 600 }}>No listings yet</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 24 }}>Be the first to mint an item on Visby</div>
              <Link href="/mint" style={{ display: 'inline-block', background: GH, borderRadius: 'var(--pill)', padding: '13px 28px', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                + Mint First Item
              </Link>
            </div>
          )}

          {/* Cards */}
          {!isLoading && items.length > 0 && (
            <div className="visby-grid">
              {items.map((item, i) => {
                const sellerInit = (item.current_owner_wallet[0] ?? '?').toUpperCase();
                return (
                  <Link key={item.id} href={`/item/${item.id}`}
                    style={{ textDecoration: 'none', background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderRadius: 'var(--r-lg)', overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', display: 'flex', flexDirection: 'column' }}>

                    {/* Image */}
                    <div style={{ background: 'var(--glass-hairline)', height: 150, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {(item as any).image_url
                        ? <img src={(item as any).image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.category}</span>
                      }
                      <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)', borderRadius: 8, padding: '2px 7px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.92)', border: '1px solid rgba(255,255,255,.18)' }}>
                        {item.condition}
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ padding: '11px 12px 13px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: AVATAR_GRADS[i % AVATAR_GRADS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                          {sellerInit}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {shortAddr(item.current_owner_wallet)}
                        </span>
                      </div>
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
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  );
}
