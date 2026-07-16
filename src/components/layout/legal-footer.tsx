'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { S, t } from '@/lib/ui';

// Global footer with the legal links. Bottom padding clears the fixed BottomNav.
export function LegalFooter() {
  const pathname = usePathname();
  // The /sdk hosted checkout renders its own compact "Secured by Visby" footer — keep the app's global
  // legal footer out of the merchant-embedded popup.
  if (pathname?.startsWith('/sdk')) return null;
  return (
    <footer
      className="visby-inner"
      style={{
        marginTop: S[7], paddingTop: S[6], paddingBottom: 112,
        borderTop: '1px solid var(--divider)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: S[3],
      }}
    >
      <Link href="/legal/terms" style={{ ...t('meta'), color: 'var(--text-muted)', textDecoration: 'none' }}>Terms</Link>
      <span style={{ ...t('meta'), color: 'var(--divider)' }}>·</span>
      <Link href="/legal/privacy" style={{ ...t('meta'), color: 'var(--text-muted)', textDecoration: 'none' }}>Privacy</Link>
      <span style={{ ...t('meta'), color: 'var(--divider)' }}>·</span>
      <Link href="/legal/acceptable-use" style={{ ...t('meta'), color: 'var(--text-muted)', textDecoration: 'none' }}>Acceptable Use</Link>
      <span style={{ ...t('meta'), color: 'var(--divider)' }}>·</span>
      <Link href="/legal/seller-agreement" style={{ ...t('meta'), color: 'var(--text-muted)', textDecoration: 'none' }}>Seller Agreement</Link>
      <span style={{ ...t('micro'), color: 'var(--text-muted)', flexBasis: '100%', textAlign: 'center', marginTop: S[1] }}>© 2026 Visby</span>
    </footer>
  );
}
