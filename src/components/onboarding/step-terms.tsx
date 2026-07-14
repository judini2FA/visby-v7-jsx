'use client';

import { useState } from 'react';
import Link from 'next/link';
import { t, S, T, btn, surface } from '@/lib/ui';

const LS_TERMS_ACCEPTED = 'visby-terms-accepted-v1';

// Required step — no skip. Persists acceptance locally with a timestamp; profiles.upsertProfile
// has no column for this yet (grepped src/server/routers/profiles.ts), so server-side persistence
// is deferred rather than inventing a migration in this pass.
export function StepTerms({ onNext }: { onNext: () => void }) {
  const [agreed, setAgreed] = useState(false);

  function handleContinue() {
    if (!agreed) return;
    try { localStorage.setItem(LS_TERMS_ACCEPTED, new Date().toISOString()); } catch {}
    // TODO: server-side terms_accepted_at — no column on profiles yet; wire this up once a
    // migration adds one instead of persisting acceptance only in localStorage.
    onNext();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div>
        <div style={{ ...t('title'), color: T.textStrong }}>Welcome to Visby</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], lineHeight: 1.6 }}>
          Visby helps you buy and sell authenticated luxury goods with blockchain-verified
          provenance. Payments and payouts run through our secure partners, and every listing,
          purchase, and message on Visby is governed by our Terms of Service and Privacy Policy.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ ...t('body'), color: T.aqua, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Terms of Service
        </Link>
        <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ ...t('body'), color: T.aqua, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Privacy Policy
        </Link>
      </div>

      <label style={{ ...surface({ pad: '12px 14px' }), display: 'flex', alignItems: 'flex-start', gap: S[3], cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: '#2A8AED', cursor: 'pointer' }}
        />
        <span style={{ ...t('body'), color: T.textStrong }}>I agree to the Terms of Service and Privacy Policy.</span>
      </label>

      <button
        type="button"
        onClick={handleContinue}
        disabled={!agreed}
        style={{ ...btn('primary', { full: true }), opacity: agreed ? 1 : 0.5, cursor: agreed ? 'pointer' : 'not-allowed' }}
      >
        Continue
      </button>
    </div>
  );
}
