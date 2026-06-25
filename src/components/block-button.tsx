'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { btn, S } from '@/lib/ui';

export function BlockButton({
  viewerWallet,
  targetWallet,
  getAccessToken,
  onChange,
}: {
  viewerWallet: string;
  targetWallet: string;
  getAccessToken: () => Promise<string | null>;
  onChange?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const { data, refetch } = trpc.blocks.status.useQuery(
    { viewer: viewerWallet, other: targetWallet },
    { enabled: !!viewerWallet && !!targetWallet },
  );

  const iBlocked = data?.i_blocked ?? false;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const token = await getAccessToken();
      const method = iBlocked ? 'DELETE' : 'POST';
      await fetch('/api/blocks', {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ blocker_wallet: viewerWallet, blocked_wallet: targetWallet }),
      });
      await refetch();
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      style={{
        ...btn(iBlocked ? 'danger' : 'secondary'),
        opacity: busy ? 0.6 : 1,
        gap: S[1],
        padding: `${S[2]}px ${S[4]}px`,
      }}
    >
      {iBlocked ? (
        <>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          Unblock
        </>
      ) : (
        <>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          Block
        </>
      )}
    </button>
  );
}
