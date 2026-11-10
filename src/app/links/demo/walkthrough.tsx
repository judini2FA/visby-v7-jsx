'use client';

import { useState, type ReactNode } from 'react';
import { t, S, T, btn, card, sectionLabel } from '@/lib/ui';
import { PhoneFrame } from './phone';
import { HomeScreen, ItemScreen, CheckoutScreen, OrderScreen, ResellScreen } from './screens';
import { WALKTHROUGH, WALKTHROUGH_INTRO } from './copy';

const SCREENS: { label: string; node: ReactNode }[] = [
  { label: 'The Visby home screen with a grid of items for sale', node: <HomeScreen /> },
  { label: 'An item page with its badges, price and Tally', node: <ItemScreen /> },
  { label: 'The checkout screen paying by card with free shipping', node: <CheckoutScreen /> },
  { label: 'An order that has shipped, with Visby holding the payment', node: <OrderScreen stage="shipping" /> },
  { label: 'A delivered order with the Tally now listing you as the owner', node: <OrderScreen stage="delivered" /> },
  { label: 'Listing the item for resale with the fee and payout shown', node: <ResellScreen /> },
];

export function Walkthrough() {
  const [i, setI] = useState(0);
  const last = WALKTHROUGH.length - 1;
  const step = WALKTHROUGH[i];

  return (
    <section aria-labelledby="walkthrough-title" style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[4] }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: S[1] }}>
        <div style={sectionLabel()}>{WALKTHROUGH_INTRO.eyebrow}</div>
        <h2 id="walkthrough-title" style={{ ...t('title'), color: T.textStrong, margin: 0 }}>{WALKTHROUGH_INTRO.title}</h2>
        <p style={{ ...t('meta'), color: T.textMuted, margin: 0 }}>{WALKTHROUGH_INTRO.hint}</p>
      </div>

      <PhoneFrame label={SCREENS[i].label}>{SCREENS[i].node}</PhoneFrame>

      <div role="group" aria-label="Walkthrough steps" style={{ display: 'flex', gap: S[2] }}>
        {WALKTHROUGH.map((s, n) => (
          <button key={s.title} type="button" onClick={() => setI(n)} aria-label={`Step ${n + 1}: ${s.title}`} aria-current={n === i ? 'step' : undefined}
            style={{ width: n === i ? 24 : 8, height: 8, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: n === i ? 'var(--text-strong)' : 'var(--divider)', transition: 'width .2s var(--ease)' }} />
        ))}
      </div>

      <div aria-live="polite" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: S[1], minHeight: 96, maxWidth: 340 }}>
        <div style={sectionLabel()}>Step {i + 1} of {WALKTHROUGH.length}</div>
        <h3 style={{ ...t('heading'), color: T.textStrong, margin: 0 }}>{step.title}</h3>
        <p style={{ ...t('body'), color: T.textMuted, margin: 0 }}>{step.caption}</p>
      </div>

      <div style={{ display: 'flex', gap: S[3], width: '100%', maxWidth: 340 }}>
        <button type="button" onClick={() => setI(i - 1)} disabled={i === 0} style={{ ...btn('secondary', { full: true }), opacity: i === 0 ? 0.4 : 1 }}>Back</button>
        <button type="button" onClick={() => setI(i === last ? 0 : i + 1)} style={btn('primary', { full: true })}>{i === last ? 'Start over' : 'Next'}</button>
      </div>
    </section>
  );
}
