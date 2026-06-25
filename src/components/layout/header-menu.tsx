'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { S, t, sheet, surface, btn } from '@/lib/ui';

const ICONS: Record<string, JSX.Element> = {
  sales:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  purchases: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  liked:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  settings:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  doc:       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
  shield:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

const LINKS = [
  { label: 'Sales history',    href: '/dashboard?tab=sales',     icon: 'sales' },
  { label: 'Purchase history', href: '/dashboard?tab=purchases', icon: 'purchases' },
  { label: 'Liked Items',      href: '/liked',                   icon: 'liked' },
  { label: 'Settings',         href: '/settings',                icon: 'settings' },
  { label: 'Terms of Service', href: '/legal/terms',             icon: 'doc' },
  { label: 'Privacy Policy',   href: '/legal/privacy',           icon: 'shield' },
] as const;

// The three-line menu button + its bottom-sheet, fully self-contained. Drop it into any page header.
export function HeaderMenu({ buttonStyle }: { buttonStyle?: React.CSSProperties }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border: '1px solid var(--glass-border)',
          borderRadius: 14, padding: '9px 11px',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center',
          ...buttonStyle,
        }}
      >
        {[0, 1, 2].map(i => <div key={i} style={{ width: 18, height: 1.5, background: 'var(--text)', borderRadius: 1 }} />)}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.5)' }} />
          <div style={{ ...sheet({ radius: '30px 30px 0 0' }), position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 600, zIndex: 201, borderBottom: 'none', padding: `0 ${S[5]}px ${S[7]}px`, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2, margin: `${S[4]}px auto ${S[5]}px` }} />

            {LINKS.map(item => (
              <Link key={item.label} href={item.href} onClick={() => setOpen(false)}
                style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3], marginTop: S[2], textDecoration: 'none' }}>
                <div style={{ ...surface({ radius: 'var(--r-sm)' }), width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {ICONS[item.icon]}
                </div>
                <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>{item.label}</span>
                <svg style={{ marginLeft: 'auto' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            ))}

            <div style={{ marginTop: S[5] }}>
              {ready && (authenticated
                ? <button onClick={() => { logout(); setOpen(false); }} style={btn('danger', { full: true, pill: false })}>Sign Out</button>
                : <button onClick={() => { login(); setOpen(false); }} style={btn('primary', { full: true, pill: false })}>Sign In</button>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
