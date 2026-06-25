'use client';

import { badge } from '@/lib/ui';

// Shows when a Tally's serial number matched a registered brand's verified ranges — set server-side
// at mint by checkSerial() → items.serial_status. Distinct from the green "Authenticated" badge,
// which is Visby's manual per-item authentication. Brand accent (#2A8AED) is mode-independent.
export function BrandBadge({ status, brand, size = 13 }: { status?: string; brand?: string | null; size?: number }) {
  if (status !== 'verified') return null;
  return (
    <span style={{ ...badge('default'), color: '#2A8AED', borderColor: 'rgba(42,138,237,.35)', background: 'rgba(42,138,237,.10)' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
      {brand ? `${brand} verified` : 'Brand verified'}
    </span>
  );
}
