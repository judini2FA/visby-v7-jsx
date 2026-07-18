'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';

// Active = a solid icon in the FOOTER colour (a knockout) sitting on a light gradient circle.
// Inactive = a muted outline icon. The active shapes are dedicated filled paths so they read solid
// (home keeps an open doorway, wallet/profile aren't janky); messages + sell reuse their one path.
function Icon({ id, active }: { id: string; active: boolean }) {
  const color = active ? 'var(--surface-bg)' : 'var(--text-muted)';

  if (active) {
    const f = { width: 23, height: 23, viewBox: '0 0 24 24', fill: color };
    if (id === 'home')     return <svg {...f}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>;
    if (id === 'messages') return <svg {...f}><g transform="translate(2 0)"><path d="M5 7 H11.5 A5.5 5.5 0 0 0 17 12.5 V19 A2 2 0 0 1 15 21 H5 A2 2 0 0 1 3 19 V9 A2 2 0 0 1 5 7 Z" /><circle cx="17" cy="7" r="2.4" /></g></svg>;
    if (id === 'sell')     return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
    if (id === 'wallet')   return <svg {...f} fillRule="evenodd"><path d="M4 4.4 H20 A2.6 2.6 0 0 1 22.6 7 V17 A2.6 2.6 0 0 1 20 19.6 H4 A2.6 2.6 0 0 1 1.4 17 V7 A2.6 2.6 0 0 1 4 4.4 Z M3 9.4 H21 V10.7 H3 Z" /></svg>;
    return <svg {...f}><circle cx="12" cy="8" r="4" /><path d="M12 14c-4.4 0-8 2.6-8 5.8 0 .7.6 1.2 1.3 1.2h13.4c.7 0 1.3-.5 1.3-1.2 0-3.2-3.6-5.8-8-5.8z" /></svg>;
  }

  // home / wallet / profile: stroke the SAME paths as their filled versions so the two states match.
  const s = { width: 23, height: 23, viewBox: '0 0 24 24', fill: 'none' as const, stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (id === 'home')     return <svg {...s}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>;
  if (id === 'messages') return <svg {...s}><g transform="translate(2 0)"><path d="M5 7 H11.5 A5.5 5.5 0 0 0 17 12.5 V19 A2 2 0 0 1 15 21 H5 A2 2 0 0 1 3 19 V9 A2 2 0 0 1 5 7 Z" /><circle cx="17" cy="7" r="2.2" /></g></svg>;
  if (id === 'sell')     return <svg {...{ ...s, strokeWidth: 2 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
  if (id === 'wallet')   return <svg {...s}><rect x="1.5" y="4.5" width="21" height="15" rx="2.6" /><line x1="1.5" y1="10" x2="22.5" y2="10" /></svg>;
  return <svg {...s}><circle cx="12" cy="8" r="4" /><path d="M12 14c-4.4 0-8 2.6-8 5.8 0 .7.6 1.2 1.3 1.2h13.4c.7 0 1.3-.5 1.3-1.2 0-3.2-3.6-5.8-8-5.8z" /></svg>;
}

const TABS = [
  { id: 'home',     label: 'Home',    href: '/' },
  { id: 'messages', label: 'Inbox',   href: '/dashboard?tab=messages' },
  { id: 'sell',     label: 'Sell',    href: '/dashboard/seller' },
  { id: 'wallet',   label: 'Wallet',  href: '/wallet' },
  { id: 'profile',  label: 'Profile', href: '/profile' },
] as const;

export function BottomNav() {
  // useSearchParams() requires a Suspense boundary in the App Router; BottomNav is mounted
  // directly in the root layout with no ancestor Suspense, so it provides its own.
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}

function BottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { address } = useVisbWallet();
  const { data: conversations } = trpc.messages.getConversations.useQuery(
    { wallet: address },
    { enabled: !!address, refetchInterval: 15000 },
  );
  const { data: notifUnread } = trpc.notifications.unreadCount.useQuery(
    { wallet: address },
    { enabled: !!address, refetchInterval: 15000 },
  );
  const msgUnread = conversations?.reduce((sum, c) => sum + (c.unread ?? 0), 0) ?? 0;
  const unreadTotal = msgUnread + (notifUnread ?? 0);

  // An open message thread (?msg=<wallet> on /dashboard) renders its own full-screen header +
  // footer — see MessagesTab in src/app/dashboard/page.tsx — so the global bottom nav steps aside.
  const threadOpen = pathname === '/dashboard' && !!searchParams.get('msg');

  // /sdk = the merchant-embedded hosted checkout (and demo). It runs on a merchant's behalf in a popup —
  // Visby's internal marketplace nav must never bleed into it.
  if (['/mint', '/login', '/sdk'].some(p => pathname.startsWith(p)) || pathname.startsWith('/item/') || threadOpen) {
    return null;
  }

  return (
    <nav className="bottom-nav-wrap" style={{
      position: 'fixed',
      bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 28px)',
      // Matches the mode's surface colour (white in light, dark surface in dark) and floats on a shadow.
      background: 'var(--surface-bg)',
      backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
      WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
      border: '1px solid var(--glass-border)',
      borderRadius: 999,
      boxShadow: '0 12px 32px rgba(15,15,30,.20), 0 2px 8px rgba(15,15,30,.10)',
      padding: '7px 10px', zIndex: 100,
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
        {TABS.map(t => {
          const hrefPath = t.href.split('?')[0];
          const active =
            hrefPath === '/'
              ? pathname === '/'
              : hrefPath === '/dashboard'
                ? pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/seller')
                : pathname.startsWith(hrefPath);

          return (
            <Link
              key={t.id} href={t.href} aria-label={t.label} prefetch={true}
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <div style={{
                position: 'relative',
                width: 46, height: 46, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'var(--grad-brand)' : 'transparent',
                boxShadow: active ? 'var(--cta-shadow)' : 'none',
                transition: 'background .18s ease',
              }}>
                <Icon id={t.id} active={active} />
                {t.id === 'messages' && unreadTotal > 0 && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    minWidth: 16, height: 16, boxSizing: 'border-box',
                    background: 'var(--danger)', color: '#fff',
                    borderRadius: 8, border: '2px solid var(--surface-bg)',
                    fontSize: 10, fontWeight: 700, lineHeight: 1,
                    padding: unreadTotal > 9 ? '0 3px' : 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
