'use client';

import { useAdminRole } from '@/lib/use-admin-role';
import { AdminNav } from '@/components/admin/admin-nav';
import { t, S, T } from '@/lib/ui';

// Shared shell for every /admin page: one auth gate + one section nav. Individual pages render only
// their content. Server routes stay the real authorization boundary; this gate is UX.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role, isAdmin, loading } = useAdminRole();

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', ...t('meta') }}>
        Loading…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[3], padding: S[5] }}>
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p style={{ ...t('heading'), color: T.textMuted, margin: 0 }}>Not authorized</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <AdminNav role={role} />
      {children}
    </div>
  );
}
