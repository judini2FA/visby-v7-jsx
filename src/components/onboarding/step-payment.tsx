'use client';

import { useRouter } from 'next/navigation';
import { t, S, T, btn, surface } from '@/lib/ui';

// Skippable step — purely an explainer, no form. "Add a card or bank" hands off to the wallet
// tab on /profile (where payment-methods-manager.tsx lives) and completes the wizard at the
// same time, since that page is where the rest of the flow happens.
export function StepPayment({ onFinish, onSkip }: { onFinish: () => void; onSkip: () => void }) {
  const router = useRouter();

  function addPaymentMethod() {
    onFinish();
    router.push('/profile?tab=wallet');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div>
        <div style={{ ...t('title'), color: T.textStrong }}>Your wallet is ready</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], lineHeight: 1.6 }}>
          A secure Visby wallet was created for you automatically — no crypto knowledge needed.
          Add a card or bank account now so checkout is one tap later, or do it whenever you're ready.
        </div>
      </div>

      <div style={{ ...surface({ pad: S[4] }), display: 'flex', alignItems: 'center', gap: S[3] }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
        </svg>
        <div style={{ ...t('meta'), color: T.textMuted, lineHeight: 1.5 }}>
          Your Visby wallet is already secured to your account — this just adds a funding source.
        </div>
      </div>

      <div style={{ display: 'flex', gap: S[2] }}>
        <button type="button" onClick={onSkip} style={{ ...btn('secondary'), flex: 1 }}>Skip</button>
        <button type="button" onClick={addPaymentMethod} style={{ ...btn('primary'), flex: 2 }}>Add a card or bank</button>
      </div>
    </div>
  );
}
