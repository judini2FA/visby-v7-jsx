'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, btn, card, T } from '@/lib/ui';

type AccountStatus = 'active' | 'suspended' | 'banned';

// Fail-open by design: unknown/error status never blocks the app. Only a confirmed 'banned' read
// from the server locks anyone out — a flaky network or an unmigrated endpoint must never strand a
// legitimate user (mirrors the fail-open posture in getWorstStatus on the server).
export function AccountGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, getAccessToken, logout } = usePrivy();
  const { address: wallet, ready: walletReady } = useVisbWallet();

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const checkedForWallet = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/account/status?wallet=${encodeURIComponent(wallet)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) { setStatus(null); return; } // fail open — unknown, render children
      const j = await res.json().catch(() => ({}));
      const s = j?.status as AccountStatus | undefined;
      if (s === 'suspended' || s === 'banned' || s === 'active') {
        setStatus(s);
        setReason(typeof j?.reason === 'string' ? j.reason : undefined);
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null); // fail open — never lock someone out on a fetch error
    }
  }, [wallet, getAccessToken]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    if (!walletReady || !wallet) return;
    if (checkedForWallet.current === wallet) return;
    checkedForWallet.current = wallet;
    setBannerDismissed(false);
    load();
  }, [ready, authenticated, walletReady, wallet, load]);

  // Reset once signed out so a later sign-in (possibly a different account) re-checks.
  useEffect(() => {
    if (!authenticated) {
      checkedForWallet.current = null;
      setStatus(null);
    }
  }, [authenticated]);

  if (status === 'banned') {
    return <BannedOverlay reason={reason} onSignOut={() => logout()} />;
  }

  return (
    <>
      {status === 'suspended' && !bannerDismissed && (
        <SuspendedBanner reason={reason} onDismiss={() => setBannerDismissed(true)} />
      )}
      {children}
    </>
  );
}

function BannedOverlay({ reason, onSignOut }: { reason?: string; onSignOut: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483600,
        background: 'var(--bg-0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: S[5],
      }}
    >
      <div style={{ ...card(), width: '100%', maxWidth: 400, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        <div style={{ ...t('title'), color: T.textStrong, marginTop: S[4] }}>
          Your Visby account has been suspended
        </div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2] }}>
          {reason || 'This account no longer has access to Visby.'}
        </div>
        <div style={{ ...t('meta'), color: T.textMuted, marginTop: S[4] }}>
          Think this is a mistake? Contact support and we'll take a look.
        </div>
        <button onClick={onSignOut} style={{ ...btn('primary', { full: true }), marginTop: S[5] }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function SuspendedBanner({ reason, onDismiss }: { reason?: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: S[3],
        padding: `${S[3]}px ${S[4]}px`,
        background: 'var(--warn-soft)',
        borderBottom: '1px solid var(--warn-soft)',
      }}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...t('meta'), color: 'var(--warn)', fontWeight: 700 }}>
          Your account is limited — you can't list items right now.
        </div>
        {reason && (
          <div style={{ ...t('meta'), color: 'var(--warn)', opacity: 0.85, marginTop: 2 }}>
            {reason}
          </div>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: S[1], flexShrink: 0, display: 'flex' }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
