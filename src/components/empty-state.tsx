import type { ReactNode } from 'react';
import Link from 'next/link';
import { S, t, T, surface, btn } from '@/lib/ui';

type EmptyStateAction = { label: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: EmptyStateAction;
}) {
  return (
    <div style={{ ...surface({ pad: '48px 24px' }), textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--glass-bg-strong)',
          border: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: `0 auto ${S[4]}px`,
        }}
      >
        {icon}
      </div>
      <div style={{ ...t('heading'), color: T.textStrong, marginBottom: S[2] }}>{title}</div>
      <div style={{ ...t('body'), color: T.textMuted, lineHeight: 1.6 }}>{message}</div>
      {action ? (
        action.href ? (
          <Link href={action.href} style={{ ...btn('primary', { pill: false }), marginTop: S[5], display: 'inline-flex' }}>
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} style={{ ...btn('primary', { pill: false }), marginTop: S[5] }}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}
