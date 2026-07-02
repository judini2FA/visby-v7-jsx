'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, S, glass, T } from '@/lib/ui';
import { HeaderMenu } from '@/components/layout/header-menu';
import type { AdminRole } from '@/lib/admin';

// One horizontal, scrollable section switcher shared across every /admin page (via admin/layout).
// super_admin-only sections are hidden for lower roles client-side; the API routes remain the real gate.

type Section = { href: string; label: string; icon: JSX.Element; superOnly?: boolean };

const I = (d: string) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((p, i) => <path key={i} d={p} />)}
  </svg>
);

const SECTIONS: Section[] = [
  { href: '/admin', label: 'Home', icon: I('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10') },
  { href: '/admin/orders', label: 'Orders', icon: I('M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z|M3.3 7L12 12l8.7-5|M12 22V12') },
  { href: '/admin/listings', label: 'Listings', icon: I('M20.6 13.4L11 3.8a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8z|M7 7h.01') },
  { href: '/admin/users', label: 'Users', icon: I('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8') },
  { href: '/admin/finance', label: 'Finance', icon: I('M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6') },
  { href: '/admin/reports', label: 'Reports', icon: I('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|M4 22v-7') },
  { href: '/admin/disputes', label: 'Disputes', icon: I('M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z|M12 9v4|M12 17h.01') },
  { href: '/admin/kyc', label: 'KYC', icon: I('M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M7 8h4|M7 12h4|M15 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4|M13 16a2 2 0 0 1 4 0') },
  { href: '/admin/brand-registry', label: 'Brands', icon: I('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z') },
  { href: '/admin/team', label: 'Team', superOnly: true, icon: I('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M19 8v6|M22 11h-6') },
  { href: '/admin/audit', label: 'Audit', superOnly: true, icon: I('M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11') },
  { href: '/admin/legal', label: 'Legal', icon: I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M8 13h8|M8 17h8') },
];

export function AdminNav({ role }: { role: AdminRole | null }) {
  const pathname = usePathname();
  const sections = SECTIONS.filter((s) => !s.superOnly || role === 'super_admin');

  return (
    <div style={{ ...glass({ strong: true, radius: 0 }), borderBottom: '1px solid var(--divider)' }}>
      <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[2] }}>
          <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Admin</div>
          {role && (
            <span style={{ ...t('micro'), color: 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: 'var(--pill)', padding: `2px ${S[2]}px`, textTransform: 'capitalize' }}>
              {role.replace('_', ' ')}
            </span>
          )}
          <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
        </div>

        <nav style={{ display: 'flex', gap: S[1], overflowX: 'auto', scrollbarWidth: 'none', margin: `0 -${S[1]}px`, padding: `0 ${S[1]}px` }}>
          {sections.map((s) => {
            const active = s.href === '/admin' ? pathname === '/admin' : pathname.startsWith(s.href);
            return (
              <Link key={s.href} href={s.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: S[1], flexShrink: 0,
                  padding: `${S[2]}px ${S[3]}px`, borderRadius: 'var(--pill)', textDecoration: 'none',
                  ...t('meta'),
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                  background: active ? 'var(--glass-bg-strong)' : 'transparent',
                  border: `1px solid ${active ? 'var(--glass-border)' : 'transparent'}`,
                }}>
                {s.icon}{s.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
