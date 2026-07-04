'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, btn, card, T } from '@/lib/ui';

// Blueprint 5.4 — auth-relay for the browser extension. Privy's web SDK can't run inside an MV3 popup,
// so the extension opens THIS page (which is inside the app's Privy provider) with its own extension id
// as `?ext=<id>`. After the user signs in, we hand the fresh Privy access token to the extension via
// chrome.runtime.sendMessage(extId, …). The extension only accepts this message because its manifest
// declares `externally_connectable` for this origin — a random site can't inject a token. The token is
// the user's OWN session, relayed to the extension they installed.
type Phase = 'loading' | 'need-login' | 'relaying' | 'done' | 'no-extension' | 'error';

export default function ExtensionAuthPage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { address: wallet } = useVisbWallet();
  const [phase, setPhase] = useState<Phase>('loading');
  const [errMsg, setErrMsg] = useState('');

  const extId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ext') : null;

  const relay = useCallback(async () => {
    const chromeRuntime = (typeof window !== 'undefined' ? (window as any).chrome?.runtime : undefined);
    if (!extId || !chromeRuntime?.sendMessage) {
      // Opened outside the extension (or a non-Chromium browser) — nothing to hand the token to.
      setPhase('no-extension');
      return;
    }
    setPhase('relaying');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Could not get a session token — please sign in again.');
      // ts is added so the extension can expire a stale relayed token if it wants.
      chromeRuntime.sendMessage(
        extId,
        { type: 'visbyAuth', payload: { token, wallet: wallet ?? null } },
        () => {
          // A runtime.lastError here means the extension didn't accept the message (not installed / not
          // externally-connectable for this origin). Treat as "connect failed" rather than success.
          const lastErr = chromeRuntime.lastError;
          if (lastErr) { setErrMsg(lastErr.message || 'The extension did not respond.'); setPhase('error'); }
          else setPhase('done');
        },
      );
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Could not connect the extension.');
      setPhase('error');
    }
  }, [extId, getAccessToken, wallet]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) { setPhase('need-login'); return; }
    void relay();
  }, [ready, authenticated, relay]);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: S[5] }}>
      <div style={{ ...card(), width: '100%', maxWidth: 400, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: S[3] }}>
        <div style={{ ...t('title'), color: T.textStrong }}>Connect Visby Pay</div>

        {phase === 'loading' && <div style={{ ...t('body'), color: T.textMuted }}>Loading…</div>}

        {phase === 'need-login' && (
          <>
            <div style={{ ...t('body'), color: T.textMuted }}>
              Sign in to link your Visby account to the browser extension so you can pay from anywhere.
            </div>
            <button onClick={() => login()} style={{ ...btn('primary', { full: true }), marginTop: S[2] }}>
              Sign in with Visby
            </button>
          </>
        )}

        {phase === 'relaying' && <div style={{ ...t('body'), color: T.textMuted }}>Connecting the extension…</div>}

        {phase === 'done' && (
          <>
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="16 9 11 14 8 11" />
            </svg>
            <div style={{ ...t('body'), color: 'var(--ok)', fontWeight: 700 }}>Extension connected</div>
            <div style={{ ...t('meta'), color: T.textMuted }}>You can close this tab and use Visby Pay from the extension.</div>
          </>
        )}

        {phase === 'no-extension' && (
          <div style={{ ...t('body'), color: T.textMuted }}>
            Open this page from the Visby Pay extension to connect it. If you don&apos;t have the extension yet, install it first.
          </div>
        )}

        {phase === 'error' && (
          <>
            <div style={{ ...t('body'), color: 'var(--danger)' }}>{errMsg || 'Could not connect the extension.'}</div>
            <button onClick={() => relay()} style={{ ...btn('secondary', { full: true }), marginTop: S[2] }}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
