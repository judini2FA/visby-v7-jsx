import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { t, S, T, card, surface, btn, badge, price, sectionLabel } from '@/lib/ui';
import { TallyCard } from '@/components/tally-card';
import { PrelaunchWordmark } from '../../prelaunch/wordmark';

export const metadata: Metadata = {
  title: 'Visby — Demo',
  robots: { index: false, follow: false },
};

// Illustrations of the real app screens, built from the same design system (listing card, Tally card,
// wallet chain gradients from tally-wallets.tsx). Nothing here talks to an API.

const OWNER_1 = [{ wallet: 'Maya' }];
const OWNER_2 = [{ wallet: 'Maya' }, { wallet: 'Jordan' }];

const CHAINS = [
  { abbr: 'SOL', label: 'Solana', grad: 'linear-gradient(135deg,#14F195,#9945FF)', amt: '2.41' },
  { abbr: 'ETH', label: 'Ethereum', grad: 'linear-gradient(135deg,#6B8AFF,#454A75)', amt: '0.18' },
  { abbr: 'BTC', label: 'Bitcoin', grad: 'linear-gradient(135deg,#F7931A,#FFC06B)', amt: '0.004' },
];

function Sneaker({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 120 72" fill="none" aria-hidden="true">
      <path d="M8 52c0-6 3-10 8-12l22-8 10-20c2-3 6-4 9-2l8 6c4 3 9 4 14 4h6c10 0 19 6 23 15l3 7c1 3-1 6-4 6H12c-2 0-4-2-4-4z" fill="url(#sk)" />
      <path d="M8 56h104v4c0 2-2 4-4 4H12c-2 0-4-2-4-4z" fill="var(--text-strong)" opacity=".85" />
      <path d="M44 30l8 4M50 24l8 4M56 18l8 4" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="sk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#25CDB8" /><stop offset=".5" stopColor="#2A8AED" /><stop offset="1" stopColor="#BC2DE6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Screen({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ ...surface({ pad: S[4], radius: 'var(--r-lg)' }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
      {children}
    </div>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <section style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[3] }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: 'var(--grad-brand)', color: 'var(--text-on-cta)', ...t('meta'), fontWeight: 800 }}>{n}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <h2 style={{ ...t('heading'), color: T.textStrong, margin: 0 }}>{title}</h2>
          <p style={{ ...t('body'), color: T.textMuted, margin: 0 }}>{body}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] };
const fakeInput: CSSProperties = { ...t('body'), color: T.text, background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r)', padding: `${S[3]}px ${S[4]}px` };

function ListingMock({ owners, cta }: { owners: { wallet: string }[]; cta?: string }) {
  return (
    <div style={{ maxWidth: 240, alignSelf: 'center', width: '100%' }}>
      <div style={{ aspectRatio: '1 / 1', background: 'var(--surface-bg)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Sneaker size={120} />
      </div>
      <div style={{ ...surface({ radius: 'var(--r-lg)' }), background: 'var(--glass-bg-strong)', position: 'relative', margin: '-14px 8px 0', padding: '12px 13px', boxShadow: '0 10px 26px rgba(15,15,30,.18), 0 3px 8px rgba(15,15,30,.12)' }}>
        <div style={{ ...t('heading'), color: T.textStrong }}>Runner 01 · Size 10</div>
        <div style={{ ...row, marginTop: S[2] }}>
          <span style={price('md')}>$300</span>
          <span style={{ ...t('meta'), color: T.textMuted }}>{owners.length} owner{owners.length === 1 ? '' : 's'}</span>
        </div>
        {cta && <div style={{ ...btn('primary', { full: true }), marginTop: S[3] }}>{cta}</div>}
      </div>
    </div>
  );
}

export default function DemoPage() {
  return (
    <div style={{ background: 'transparent', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `${S[7]}px ${S[4]}px` }}>
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: S[3] }}>
          <PrelaunchWordmark />
          <h1 style={{ ...t('title'), color: T.textStrong, margin: `${S[4]}px 0 0` }}>How Visby works</h1>
          <p style={{ ...t('body'), color: T.textMuted, margin: `${S[2]}px 0 0`, maxWidth: 400 }}>
            Buy from a brand, get a verified history for your item, and resell it on Visby. The history follows the item to every new owner.
          </p>
        </header>

        <Step n={1} title="Buy from a brand you love" body="Partner brands add Pay with Visby to their own checkout. One tap pays with a card, bank or crypto.">
          <Screen label="A brand's checkout page with a Pay with Visby button">
            <div style={{ ...sectionLabel() }}>brand-store.com</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
              <div style={{ width: 72, height: 72, borderRadius: 'var(--r)', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sneaker size={56} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ ...t('heading'), color: T.textStrong }}>Runner 01</div>
                <div style={{ ...t('meta'), color: T.textMuted }}>Size 10 · New</div>
              </div>
              <span style={price('sm')}>$240</span>
            </div>
            <div style={btn('primary', { full: true })}>Pay with Visby</div>
          </Screen>
        </Step>

        <Step n={2} title="Sign up in seconds" body="Just an email code. Your Visby wallet is created for you automatically. No passwords, no seed phrases.">
          <Screen label="Sign up with an email code">
            <div style={fakeInput}>maya@email.com</div>
            <div style={{ display: 'flex', gap: S[2], justifyContent: 'space-between' }}>
              {['4', '8', '1', '9', '0', '3'].map((d, i) => (
                <div key={i} style={{ ...fakeInput, flex: 1, padding: `${S[3]}px 0`, textAlign: 'center', fontWeight: 700 }}>{d}</div>
              ))}
            </div>
            <div style={{ ...row, justifyContent: 'center' }}>
              <span style={badge('success')}>Your wallet is ready</span>
            </div>
          </Screen>
        </Step>

        <Step n={3} title="Your item gets a Tally" body="A Tally is your item's verified history. It records every owner, so anyone can check the item is the real thing.">
          <Screen label="A Tally card showing the item, serial number and one owner">
            <TallyCard name="Runner 01 · Size 10" serial="RN01-0042-US10" owners={OWNER_1} />
            <div style={{ ...t('meta'), color: T.textMuted, textAlign: 'center' }}>Created the moment you paid</div>
          </Screen>
        </Step>

        <Step n={4} title="Everything in one wallet" body="Your Tallys, your balance and your crypto wallets live in one place. Send to anyone, any time.">
          <Screen label="The wallet with a balance, Tallys and Solana, Ethereum and Bitcoin wallets">
            <div>
              <div style={sectionLabel()}>Balance</div>
              <div style={{ ...price('lg'), marginTop: S[1] }}>$1,284.50</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {CHAINS.map(c => (
                <div key={c.abbr} style={{ ...row, padding: `${S[2]}px 0`, borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: c.grad, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800 }}>{c.abbr}</span>
                    <span style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>{c.label}</span>
                  </span>
                  <span style={{ ...t('body'), color: T.text }}>{c.amt} {c.abbr}</span>
                </div>
              ))}
            </div>
            <div style={sectionLabel()}>Tallys</div>
            <TallyCard name="Runner 01 · Size 10" serial="RN01-0042-US10" owners={OWNER_1} />
          </Screen>
        </Step>

        <Step n={5} title="Buy and hold crypto" body="Add funds with a card or bank and hold dollars (USDC) or Solana. You always see the final amount before you confirm.">
          <Screen label="Add funds: buying Solana with a card">
            <div style={{ display: 'flex', gap: S[1], padding: 4, borderRadius: 'var(--pill)', background: 'var(--field-input-bg)' }}>
              <span style={{ flex: 1, textAlign: 'center', padding: `${S[2]}px 0`, borderRadius: 'var(--pill)', backgroundImage: 'var(--grad-brand)', color: 'var(--text-on-cta)', ...t('meta'), fontWeight: 700 }}>SOL</span>
              <span style={{ flex: 1, textAlign: 'center', padding: `${S[2]}px 0`, ...t('meta'), fontWeight: 700, color: T.textMuted }}>USDC</span>
            </div>
            <div style={{ ...price('lg'), textAlign: 'center' }}>$100.00</div>
            <div style={{ ...row, ...t('meta'), color: T.textMuted }}><span>You receive</span><span style={{ color: T.textStrong, fontWeight: 700 }}>≈ 0.62 SOL</span></div>
            <div style={btn('primary', { full: true })}>Buy with card</div>
          </Screen>
        </Step>

        <Step n={6} title="Resell on Visby" body="List your item in a few taps. You see the fee and your payout before you post it.">
          <Screen label="Listing an item for sale with the fee and payout shown">
            <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
              <div style={{ width: 56, height: 56, borderRadius: 'var(--r)', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sneaker size={44} /></div>
              <div style={{ ...t('heading'), color: T.textStrong }}>Runner 01 · Size 10</div>
            </div>
            <div style={fakeInput}>$300</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[1], ...t('meta'), color: T.textMuted }}>
              <div style={row}><span>Price</span><span>$300.00</span></div>
              <div style={row}><span>Visby fee (9%)</span><span>−$27.00</span></div>
              <div style={{ ...row, color: T.textStrong, fontWeight: 700, paddingTop: S[1], borderTop: '1px solid var(--divider)' }}><span>You receive</span><span>$273.00</span></div>
            </div>
            <div style={btn('primary', { full: true })}>List for sale</div>
          </Screen>
        </Step>

        <Step n={7} title="Buy on Visby, history included" body="Shoppers see every past owner before they buy. When they pay, the Tally moves to them and the history grows.">
          <Screen label="A listing on Visby, then the Tally showing two owners after purchase">
            <ListingMock owners={OWNER_1} cta="Buy now" />
            <div style={{ ...t('meta'), color: T.textMuted, textAlign: 'center' }}>After checkout</div>
            <TallyCard name="Runner 01 · Size 10" serial="RN01-0042-US10" owners={OWNER_2} />
          </Screen>
        </Step>

        <p style={{ ...t('micro'), color: T.textMuted, textAlign: 'center', margin: 0 }}>Illustrations of the Visby app. Names and amounts are examples.</p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3], marginTop: S[3] }}>
          <Link href="/prelaunch" style={btn('primary', { full: true })}>Join the Prelaunch</Link>
          <Link href="/links" style={{ ...t('meta'), color: T.textMuted, textDecoration: 'underline', textUnderlineOffset: 3 }}>Back to all links</Link>
        </div>
      </div>
    </div>
  );
}
