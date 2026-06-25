'use client';

import type { CSSProperties } from 'react';
import { useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';

// Reusable like/save control. Variants: `overlay` = frosted pill for on-image corners; `inline` =
// near-solid pill for light surfaces; `bare` = no chrome, just heart + count (for card footers).
// Monochrome — filled in the foreground colour when liked (white over images, theme text elsewhere),
// never red. Wallet-gated: a signed-out viewer sees the count but clicking is a no-op.
export function LikeButton({
  itemId, variant = 'overlay', style, showCount = true, tone = 'auto',
}: {
  itemId: string;
  variant?: 'overlay' | 'inline' | 'bare';
  style?: CSSProperties;
  showCount?: boolean;
  tone?: 'auto' | 'ink';   // 'ink' = fixed dark, for always-light surfaces (tally gradient)
}) {
  const { wallets } = useSolanaWallets();
  const myWallet = wallets?.[0]?.address ?? '';

  const { data, refetch } = trpc.likes.getByItem.useQuery(
    { item_id: itemId, viewer_wallet: myWallet || undefined },
    { enabled: !!itemId },
  );
  const toggle = trpc.likes.toggle.useMutation({ onSuccess: () => refetch() });

  const liked = data?.liked ?? false;
  const count = data?.count ?? 0;
  const overlay = variant === 'overlay';
  const bare = variant === 'bare';

  const likedColor = tone === 'ink' ? '#15121C' : overlay ? '#FFFFFF' : 'var(--text-strong)';
  const idleColor  = tone === 'ink' ? 'rgba(21,18,28,.5)' : overlay ? 'rgba(255,255,255,.92)' : 'var(--text-muted)';
  const color = liked ? likedColor : idleColor;

  const base: CSSProperties = overlay
    ? { background: 'var(--img-scrim)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 'var(--pill)', padding: '5px 9px' }
    : bare
      ? { background: 'none', border: 'none', padding: 0 }
      : { background: 'var(--surface-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--pill)', padding: '5px 9px' };

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (myWallet) toggle.mutate({ item_id: itemId, wallet: myWallet }); }}
      aria-label={liked ? 'Unlike' : 'Like'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        cursor: myWallet ? 'pointer' : 'default',
        ...base, ...style,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? likedColor : 'none'} stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      {showCount && <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}</span>}
    </button>
  );
}
