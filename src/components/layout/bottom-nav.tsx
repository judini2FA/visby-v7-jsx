'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const C = { cyan: '#25CDB8', blue: '#2A8AED', mag: '#BC2DE6' };

function Icon({ id, active }: { id: string; active: boolean }) {
  const gid    = `ng-${id}`;
  const stroke = active ? `url(#${gid})` : 'var(--text-muted)';
  const sw     = active ? 2.2 : 1.8;
  const s      = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none' as const, stroke, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const Grad   = () => (
    <defs>
      <linearGradient id={gid} x1="0" y1="12" x2="24" y2="12" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor={C.cyan} />
        <stop offset="50%"  stopColor={C.blue} />
        <stop offset="100%" stopColor={C.mag}  />
      </linearGradient>
    </defs>
  );
  if (id === 'home')    return <svg {...s}><Grad /><path d="M9 22H5a2 2 0 0 1-2-2V9l9-7 9 7v11a2 2 0 0 1-2 2H15"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  if (id === 'explore') return <svg {...s}><Grad /><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
  if (id === 'sell')    return <svg {...s} strokeWidth={active ? 2.4 : 2}><Grad /><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
  if (id === 'wallet')  return <svg {...s}><Grad /><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
  return <svg {...s}><Grad /><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}

const TABS = [
  { id: 'home',    label: 'Home',    href: '/' },
  { id: 'explore', label: 'Search',  href: '/marketplace' },
  { id: 'sell',    label: 'Sell',    href: '/dashboard/seller' },
  { id: 'wallet',  label: 'Inbox',   href: '/dashboard' },
  { id: 'profile', label: 'Profile', href: '/profile' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  if (['/mint', '/login'].some(p => pathname.startsWith(p)) || pathname.startsWith('/item/')) {
    return null;
  }

  return (
    <nav className="bottom-nav-wrap" style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 600,
      background: 'var(--chrome-bg)',
      borderTop: '1px solid var(--chrome-border)',
      boxShadow: '0 -8px 30px rgba(0,0,0,.10)',
      display: 'flex', justifyContent: 'space-around',
      padding: '12px 0 16px', zIndex: 100,
    }}>
      {TABS.map(t => {
        const active =
          t.href === '/'
            ? pathname === '/'
            : t.href === '/dashboard'
              ? pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/seller')
              : pathname.startsWith(t.href);

        return (
          <Link
            key={t.id} href={t.href}
            style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, padding: '0 12px' }}
          >
            <div style={{ transform: active ? 'translateY(-6px)' : 'none', transition: 'transform .2s ease' }}>
              <Icon id={t.id} active={active} />
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
