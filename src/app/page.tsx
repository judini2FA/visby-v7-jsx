'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { ThemeToggle, useTheme } from '@/lib/theme';
import { S, t, price, card, sheet, surface, btn, badge, sectionLabel, avatar, input } from '@/lib/ui';

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

function shortAddr(a: string) {
  return a?.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

// Brand mark — intentionally unchanged. Keeps its original Quicksand wordmark + colors.
function VisbyLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.28))' }}>
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

      {/* ── Menu sheet ───────────────────────────────────── */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
          <div style={{ ...sheet({ radius: '30px 30px 0 0' }), position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 600, zIndex: 201, borderBottom: 'none', padding: `0 ${S[5]}px ${S[7]}px` }}>
            <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2, margin: `${S[4]}px auto ${S[5]}px` }} />

            {/* Appearance / theme toggle */}
            <div style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[2] }}>
              <div style={{ ...surface({ radius: 'var(--r-sm)' }), width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>Appearance</span>
                <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{mode === 'dark' ? 'Night' : 'Day'} mode</span>
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
                style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3], marginTop: S[2], textDecoration: 'none' }}>
                <div style={{ ...surface({ radius: 'var(--r-sm)' }), width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>{item.label}</span>
                <svg style={{ marginLeft: 'auto' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            ))}
            <div style={{ marginTop: S[5] }}>
              {ready && (authenticated
                ? <button onClick={() => { logout(); setMenuOpen(false); }} style={btn('danger', { full: true, pill: false })}>Sign Out</button>
                : <button onClick={() => { login(); setMenuOpen(false); }} style={btn('primary', { full: true, pill: false })}>Sign In</button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="visby-page">

        {/* ── Stories ──────────────────────────────────── */}
        <div style={{ ...surface({ radius: 'var(--r-lg)', pad: '8px 12px' }), marginTop: S[4], marginBottom: S[6] }}>
          <div style={{ display: 'flex', gap: S[3], overflowX: 'auto', paddingTop: S[1], paddingBottom: S[1], scrollbarWidth: 'none' }}>
            {/* Empty state: a single + that leads to sellers to follow. Disappears once following anyone. */}
            {following.length === 0 && (
              <Link href="/discover" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, textDecoration: 'none' }}>
                <div style={{ borderRadius: '50%', border: `2px dashed var(--glass-border)` }}>
                  <div style={{ background: 'var(--bg-0)', borderRadius: '50%' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--glass-bg-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>+</div>
                  </div>
                </div>
                <span style={{ ...t('meta'), color: 'var(--text-muted)', maxWidth: 72, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Find sellers</span>
              </Link>
            )}

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
                  <span style={{ ...t('meta'), color: 'var(--text-muted)', maxWidth: 56, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.display_name ?? shortAddr(f.wallet)}
                  </span>
                </Link>
              );
            })}

          </div>
        </div>

        {/* ── Grid ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[3] }}>
          <span style={sectionLabel()}>Recommended</span>
          <Link href="/marketplace" style={{ ...t('meta'), color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: S[1] }}>
            See all
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
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

          {/* Cards */}
          {!isLoading && items.length > 0 && (
            <div className="visby-grid">
              {items.map((item, i) => {
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                        <div style={{ ...avatar('sm'), width: 22, height: 22, fontSize: 10, background: AVATAR_GRADS[i % AVATAR_GRADS.length] }}>
                          {sellerInit}
                        </div>
                        <span style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {shortAddr(item.current_owner_wallet)}
                        </span>
                      </div>
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
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  );
}
