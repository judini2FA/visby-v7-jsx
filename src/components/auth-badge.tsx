'use client';

import { badge } from '@/lib/ui';

export function AuthBadge({ status, size = 14 }: { status?: string; size?: number }) {
  if (status === 'authenticated') {
    return (
      <span style={badge('success')}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
        Authenticated
      </span>
    );
  }

  if (status === 'flagged') {
    return (
      <span style={badge('danger')}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Flagged
      </span>
    );
  }

  return null;
}
