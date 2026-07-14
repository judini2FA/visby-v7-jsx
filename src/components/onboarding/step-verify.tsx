'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, T, btn, surface } from '@/lib/ui';

type KycStatus = 'unverified' | 'pending' | 'approved' | 'declined' | 'review';

// Skippable step. Replicates src/components/kyc-verify.tsx's /api/kyc/status + /api/kyc/start
// calls directly (rather than embedding <KycVerify/>, which renders its own card() — nesting
// glass-on-glass inside the wizard's outer card() would break the design system) so this step
// can also carry onboarding-specific copy and a "skip, verify later" exit.
export function StepVerify({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { getAccessToken } = usePrivy();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [opened, setOpened] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/kyc/status', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const j = await res.json();
      setStatus(j?.kyc_status ?? null);
    } catch { /* non-fatal */ }
  }, [getAccessToken]);
  useEffect(() => { load(); }, [load]);

  async function start() {
    if (starting) return;
    setStarting(true); setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 503) { setErr("Verification isn't available yet — you can do this later."); return; }
      if (!res.ok || !j.url) { setErr(j.error ?? 'Could not start verification — try again.'); return; }
      window.open(j.url, '_blank');
      setOpened(true);
    } finally {
      setStarting(false);
    }
  }

  const approved = status === 'approved';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div>
        <div style={{ ...t('title'), color: T.textStrong }}>Verify your identity</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], lineHeight: 1.6 }}>
          Sellers must verify their identity before listing an item — buying stays open either
          way. It only takes a minute, and you can always do it later from Settings.
        </div>
      </div>

      {approved ? (
        <div style={{ ...surface({ pad: S[4] }), ...t('body'), color: T.textStrong }}>Identity verified.</div>
      ) : (
        <>
          {opened && (
            <div style={{ ...t('meta'), color: T.textMuted, lineHeight: 1.5 }}>
              Opened in a new tab — complete the check, then come back and continue.
            </div>
          )}
          {err && <div style={{ ...t('meta'), color: 'var(--danger)', lineHeight: 1.5 }}>{err}</div>}
          <button
            type="button"
            onClick={start}
            disabled={starting}
            style={{ ...btn('primary', { full: true }), opacity: starting ? 0.7 : 1, cursor: starting ? 'not-allowed' : 'pointer' }}
          >
            {starting ? 'Starting…' : 'Verify identity'}
          </button>
        </>
      )}

      <button type="button" onClick={approved ? onNext : onSkip} style={{ ...btn('secondary', { full: true }) }}>
        {approved ? 'Continue' : "Skip — I'll verify later if I sell"}
      </button>
    </div>
  );
}
