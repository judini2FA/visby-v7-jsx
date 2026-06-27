'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  isAppLockEnabled,
  isUnlockedThisSession,
  unlockAppLock,
  markLocked,
} from '@/lib/app-lock';
import { t, S, btn, T } from '@/lib/ui';

export function AppLock({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, logout } = usePrivy();
  // Optimistic init prevents a content flash for locked users on first paint.
  const [locked, setLocked] = useState(() => isAppLockEnabled() && !isUnlockedThisSession());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (authenticated && isAppLockEnabled() && !isUnlockedThisSession()) setLocked(true);
    else setLocked(false);
  }, [ready, authenticated]);

  useEffect(() => {
    if (!isAppLockEnabled()) return;
    let hiddenAt: number | null = null;
    function onVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 60000) {
        markLocked();
        if (authenticated) setLocked(true);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [authenticated]);

  async function tryUnlock() {
    setChecking(true);
    const ok = await unlockAppLock();
    setChecking(false);
    if (ok) setLocked(false);
  }

  // Keep the lock up during the pre-ready window so content never flashes;
  // once ready it's governed by authenticated + locked.
  const showOverlay =
    (!ready && isAppLockEnabled() && !isUnlockedThisSession()) ||
    (ready && authenticated && locked);

  return (
    <>
      {children}
      {showOverlay && (
        <LockOverlay checking={checking} onUnlock={tryUnlock} onSignOut={() => logout()} />
      )}
    </>
  );
}

function LockOverlay({
  checking,
  onUnlock,
  onSignOut,
}: {
  checking: boolean;
  onUnlock: () => void;
  onSignOut: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483600,
        background: 'var(--bg-0)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: S[4],
        padding: S[6],
        textAlign: 'center',
      }}
    >
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <div style={{ ...t('title'), color: 'var(--text)' }}>Visby is locked</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
        Unlock with Face ID or your passkey
      </div>
      <button onClick={onUnlock} disabled={checking} style={{ ...btn('primary'), marginTop: S[2] }}>
        {checking ? 'Unlocking…' : 'Unlock'}
      </button>
      <button
        onClick={onSignOut}
        style={{ background: 'none', border: 'none', ...t('meta'), color: 'var(--text-muted)', cursor: 'pointer' }}
      >
        Sign out instead
      </button>
    </div>
  );
}
