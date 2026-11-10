import type { CSSProperties, ReactNode } from 'react';
import { S, surface } from '@/lib/ui';

// A phone-shaped frame for the walkthrough. The inside is a plain surface (no blur) so nothing is glass on glass.
export function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div style={{
      width: '100%', maxWidth: 300, height: 500, borderRadius: 36, padding: 8,
      background: '#15121C', boxShadow: 'var(--glass-shadow)', boxSizing: 'border-box',
    }}>
      <div role="img" aria-label={label} style={{
        ...surface({ radius: 28 }), background: 'var(--bg-0)', height: '100%', overflow: 'hidden', position: 'relative',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      }}>
        <div aria-hidden style={{ height: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ width: 72, height: 6, borderRadius: 3, background: 'var(--divider)' }} />
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: `0 ${S[3]}px ${S[3]}px`, display: 'flex', flexDirection: 'column', gap: S[3] }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// The same screen content, shown flat inside a section instead of a phone.
export function Panel({ children, label, style }: { children: ReactNode; label: string; style?: CSSProperties }) {
  return (
    <div role="img" aria-label={label} style={{
      ...surface({ radius: 'var(--r-lg)', pad: S[3] }), width: '100%', maxWidth: 300, alignSelf: 'center',
      display: 'flex', flexDirection: 'column', gap: S[3], boxSizing: 'border-box', ...style,
    }}>
      {children}
    </div>
  );
}
