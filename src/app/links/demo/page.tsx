import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { t, S, T, card, btn, sectionLabel } from '@/lib/ui';
import { PrelaunchWordmark } from '../../prelaunch/wordmark';
import { Panel } from './phone';
import { Walkthrough } from './walkthrough';
import {
  BadgesScreen, CheckoutScreen, HistoryScreen, OrderScreen, PayCheckoutScreen, PayDoneScreen,
  PayoutScreen, ResellScreen, SaleScreen, StoreScreen,
} from './screens';
import { FOOTER, HEADER, SECTIONS } from './copy';

export const metadata: Metadata = {
  title: 'Visby — Demo',
  description: HEADER.subtitle,
  robots: { index: false, follow: false },
};

// One mock per step, in the same order as the copy in SECTIONS.
const MOCKS: Record<string, { label: string; node: ReactNode }[]> = {
  tally: [
    { label: 'A Tally card for a new item with one owner', node: <HistoryScreen count={1} /> },
    { label: 'A Tally card listing three owners', node: <HistoryScreen count={3} /> },
    { label: 'An Authenticated badge and a Brand verified badge', node: <BadgesScreen /> },
  ],
  money: [
    { label: 'Checkout paying by card with free shipping', node: <CheckoutScreen /> },
    { label: 'An order on its way while Visby holds the payment', node: <OrderScreen stage="shipping" /> },
    { label: 'Choosing how to get paid, with the 9% fee shown', node: <PayoutScreen /> },
  ],
  resale: [
    { label: 'Listing an item for resale with the fee shown', node: <ResellScreen /> },
    { label: 'A Tally card listing four owners', node: <HistoryScreen count={4} /> },
    { label: 'A finished sale showing what the seller received', node: <SaleScreen /> },
  ],
  pay: [
    { label: 'A store page with a Pay with Visby button', node: <StoreScreen /> },
    { label: 'The Visby Pay checkout', node: <PayCheckoutScreen /> },
    { label: 'A confirmation saying the Tally is ready', node: <PayDoneScreen /> },
  ],
};

export default function DemoPage() {
  return (
    <div style={{ background: 'transparent', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `${S[7]}px ${S[4]}px` }}>
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: S[3] }}>
          <PrelaunchWordmark />
          <h1 style={{ ...t('title'), color: T.textStrong, margin: `${S[4]}px 0 0` }}>{HEADER.title}</h1>
          <p style={{ ...t('body'), color: T.textMuted, margin: `${S[2]}px 0 0`, maxWidth: 400 }}>{HEADER.subtitle}</p>
        </header>

        <Walkthrough />

        <nav aria-label="Jump to a topic" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: S[2] }}>
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} style={{ ...btn('secondary'), padding: `${S[2]}px ${S[4]}px` }}>{s.nav}</a>
          ))}
        </nav>

        {SECTIONS.map(s => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', gap: S[5], scrollMarginTop: S[4] }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
              <div style={sectionLabel()}>{s.eyebrow}</div>
              <h2 id={`${s.id}-title`} style={{ ...t('title'), color: T.textStrong, margin: 0 }}>{s.title}</h2>
              <p style={{ ...t('body'), color: T.textMuted, margin: 0 }}>{s.intro}</p>
            </div>

            {s.steps.map((step, n) => (
              <div key={step.title} style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[3] }}>
                  <span aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', color: T.textStrong, ...t('meta'), fontWeight: 700 }}>{n + 1}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                    <h3 style={{ ...t('heading'), color: T.textStrong, margin: 0 }}>{step.title}</h3>
                    <p style={{ ...t('body'), color: T.textMuted, margin: 0 }}>{step.body}</p>
                  </div>
                </div>
                <Panel label={MOCKS[s.id][n].label}>{MOCKS[s.id][n].node}</Panel>
              </div>
            ))}

            <details style={{ borderTop: '1px solid var(--divider)', paddingTop: S[3] }}>
              <summary style={{ ...t('meta'), color: T.textStrong, fontWeight: 700, cursor: 'pointer' }}>{FOOTER.curiousLabel}</summary>
              <p style={{ ...t('body'), color: T.textMuted, margin: `${S[2]}px 0 0` }}>{s.curious}</p>
            </details>
          </section>
        ))}

        <p style={{ ...t('micro'), color: T.textMuted, textAlign: 'center', margin: 0 }}>{FOOTER.note}</p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3], marginTop: S[3] }}>
          <Link href="/prelaunch" style={btn('primary', { full: true })}>{FOOTER.cta}</Link>
          <Link href="/links" style={{ ...t('meta'), color: T.textMuted, textDecoration: 'underline', textUnderlineOffset: 3 }}>{FOOTER.back}</Link>
        </div>
      </div>
    </div>
  );
}
