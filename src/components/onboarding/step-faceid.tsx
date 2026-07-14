'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { enableAppLock, webauthnSupported } from '@/lib/app-lock';
import { t, S, T, btn, surface } from '@/lib/ui';

// Skippable, final step — reuses lib/app-lock.ts's enableAppLock exactly as security-settings.tsx
// does. Both the "enable" success state and "skip" both finish the wizard since there's no step 7.
export function StepFaceId({ onFinish, onSkip }: { onFinish: () => void; onSkip: () => void }) {
  const { user } = usePrivy();
  const [supported] = useState(() => webauthnSupported());
  const [enabling, setEnabling] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [err, setErr] = useState('');

  async function handleEnable() {
    if (enabling) return;
    setEnabling(true); setErr('');
    const r = await enableAppLock(user?.email?.address || 'Visby');
    setEnabling(false);
    if (r.ok) setEnabled(true);
    else setErr(r.reason === 'unsupported' ? "This device can't do Face ID / passkey lock." : "Couldn't turn it on — try again.");
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div>
        <div style={{ ...t('title'), color: T.textStrong }}>Lock it down</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], lineHeight: 1.6 }}>
          Use Face ID to unlock Visby on this device.
        </div>
      </div>

      {enabled ? (
        <div style={{ ...surface({ pad: S[4] }), ...t('body'), color: T.textStrong }}>Face ID / passkey lock is on.</div>
      ) : supported ? (
        <>
          {err && <div style={{ ...t('meta'), color: 'var(--danger)' }}>{err}</div>}
          <button
            type="button"
            onClick={handleEnable}
            disabled={enabling}
            style={{ ...btn('primary', { full: true }), opacity: enabling ? 0.7 : 1, cursor: enabling ? 'not-allowed' : 'pointer' }}
          >
            {enabling ? 'Enabling…' : 'Enable Face ID'}
          </button>
        </>
      ) : (
        <div style={{ ...surface({ pad: S[4] }), ...t('meta'), color: T.textMuted }}>
          This device doesn't support Face ID / passkey lock.
        </div>
      )}

      <button type="button" onClick={enabled ? onFinish : onSkip} style={{ ...btn(enabled ? 'primary' : 'secondary', { full: true }) }}>
        {enabled ? 'Finish' : 'Skip'}
      </button>
    </div>
  );
}
