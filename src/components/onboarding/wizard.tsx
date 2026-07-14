'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { card, t, S } from '@/lib/ui';
import { StepTerms } from './step-terms';
import { StepProfile } from './step-profile';
import { StepAddress } from './step-address';
import { StepPayment } from './step-payment';
import { StepVerify } from './step-verify';
import { StepFaceId } from './step-faceid';

const TOTAL_STEPS = 6;

// Full-screen post-auth signup wizard, rendered by OnboardingGate INSTEAD OF the app whenever
// the gate decides a signup is in progress. Never traps: steps 3-6 all have a skip/continue path
// to the next step (or to onFinish on the last step), and Sign out is always reachable.
export function OnboardingWizard({ wallet, onFinish }: { wallet: string; onFinish: () => void }) {
  const { logout } = usePrivy();
  const [step, setStep] = useState(1);

  function next() { setStep(s => Math.min(TOTAL_STEPS, s + 1)); }
  function back() { setStep(s => Math.max(1, s - 1)); }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483500,
        background: 'var(--bg-0)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: S[5],
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', margin: 'auto 0' }}>

        <div style={{ display: 'flex', gap: S[1], marginBottom: S[5] }} aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(n => (
            <div
              key={n}
              aria-hidden
              style={{
                width: n === step ? 22 : 6,
                height: 6,
                borderRadius: 'var(--pill)',
                background: n <= step ? 'var(--grad-brand)' : 'var(--glass-border)',
                transition: 'width .25s var(--ease), background .25s var(--ease)',
              }}
            />
          ))}
        </div>

        <div style={{ ...card({ pad: S[5] }), width: '100%', display: 'flex', flexDirection: 'column', gap: S[4] }}>
          {step > 1 && (
            <button
              type="button"
              onClick={back}
              aria-label="Back"
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, margin: `-${S[1]}px 0 0`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Back</span>
            </button>
          )}

          {step === 1 && <StepTerms onNext={next} />}
          {step === 2 && <StepProfile wallet={wallet} onNext={next} />}
          {step === 3 && <StepAddress wallet={wallet} onNext={next} onSkip={next} />}
          {step === 4 && <StepPayment onFinish={onFinish} onSkip={next} />}
          {step === 5 && <StepVerify onNext={next} onSkip={next} />}
          {step === 6 && <StepFaceId onFinish={onFinish} onSkip={onFinish} />}
        </div>

        <button
          type="button"
          onClick={() => logout()}
          style={{ background: 'none', border: 'none', padding: 0, marginTop: S[5], cursor: 'pointer', ...t('meta'), color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
