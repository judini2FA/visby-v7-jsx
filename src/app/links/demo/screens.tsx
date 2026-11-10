import type { CSSProperties, ReactNode } from 'react';
import { t, S, T, btn, badge, price, sectionLabel, surface, tabSlider } from '@/lib/ui';
import { TallyCard } from '@/components/tally-card';
import { AuthBadge } from '@/components/auth-badge';
import { BrandBadge } from '@/components/brand-badge';

// Recreations of the real app screens, built from the same labels and design helpers. Static: nothing here
// talks to an API, and every name and amount is an example.

const OWNER_BRAND = { wallet: 'Northline' };
const OWNER_SELLER = { wallet: 'Maya' };
const OWNER_YOU = { wallet: 'Jordan' };
const OWNER_NEXT = { wallet: 'Riley' };

const ITEM = 'Runner 01 · Size 10';
const SERIAL = 'RN01-0042-US10';

const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] };
const col: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: S[3] };
const fakeInput: CSSProperties = { ...t('body'), color: T.text, background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r)', padding: `${S[2]}px ${S[3]}px` };
const muted: CSSProperties = { ...t('meta'), color: T.textMuted };

type Kind = 'shoe' | 'watch' | 'bag';

function Art({ kind, size = 96 }: { kind: Kind; size?: number }) {
  return (
    <svg width={size} height={size * 0.66} viewBox="0 0 120 80" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="demo-art" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#25CDB8" /><stop offset=".5" stopColor="#2A8AED" /><stop offset="1" stopColor="#BC2DE6" />
        </linearGradient>
      </defs>
      {kind === 'shoe' && (
        <>
          <path d="M8 56c0-6 3-10 8-12l22-8 10-20c2-3 6-4 9-2l8 6c4 3 9 4 14 4h6c10 0 19 6 23 15l3 7c1 3-1 6-4 6H12c-2 0-4-2-4-4z" fill="url(#demo-art)" />
          <path d="M8 60h104v4c0 2-2 4-4 4H12c-2 0-4-2-4-4z" fill="var(--text-strong)" opacity=".85" />
          <path d="M44 34l8 4M50 28l8 4M56 22l8 4" stroke="var(--bg-0)" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {kind === 'watch' && (
        <>
          <rect x="46" y="2" width="28" height="76" rx="8" fill="url(#demo-art)" opacity=".45" />
          <circle cx="60" cy="40" r="26" fill="var(--bg-0)" stroke="url(#demo-art)" strokeWidth="5" />
          <path d="M60 40V24M60 40l11 6" stroke="var(--text-strong)" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {kind === 'bag' && (
        <>
          <path d="M42 34c0-24 36-24 36 0" stroke="var(--text-strong)" strokeWidth="5" strokeLinecap="round" opacity=".8" />
          <rect x="22" y="32" width="76" height="44" rx="10" fill="url(#demo-art)" />
          <rect x="22" y="44" width="76" height="4" fill="var(--bg-0)" opacity=".35" />
        </>
      )}
    </svg>
  );
}

function Thumb({ kind, h = 96, children }: { kind: Kind; h?: number; children?: ReactNode }) {
  return (
    <div style={{ position: 'relative', height: h, borderRadius: 'var(--r-lg)', background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Art kind={kind} size={Math.min(110, h * 1.15)} />
      {children}
    </div>
  );
}

function SmallThumb({ kind }: { kind: Kind }) {
  return (
    <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Art kind={kind} size={40} />
    </div>
  );
}

function ItemRow({ sub }: { sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
      <SmallThumb kind="shoe" />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...t('heading'), color: T.textStrong }}>{ITEM}</div>
        <div style={muted}>{sub}</div>
      </div>
    </div>
  );
}

function Check({ done, current }: { done?: boolean; current?: boolean }) {
  return (
    <span aria-hidden style={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: done ? 'var(--ok)' : 'transparent', border: done ? 'none' : `2px solid ${current ? 'var(--text-strong)' : 'var(--divider)'}`,
    }}>
      {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bg-0)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
    </span>
  );
}

function FeeRows({ received = 'You receive' }: { received?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[1], ...muted }}>
      <div style={row}><span>Price</span><span>$300.00</span></div>
      <div style={row}><span>Visby fee (9%)</span><span>−$27.00</span></div>
      <div style={{ ...row, color: T.textStrong, fontWeight: 700, paddingTop: S[1], borderTop: '1px solid var(--divider)' }}><span>{received}</span><span>$273.00</span></div>
    </div>
  );
}

function Listing({ kind, name, cost, owners }: { kind: Kind; name: string; cost: string; owners: number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Thumb kind={kind} h={92} />
      <div style={{ ...surface({ radius: 'var(--r)' }), position: 'relative', margin: `-${S[3]}px ${S[1]}px 0`, padding: S[2] }}>
        <div style={{ ...t('meta'), color: T.textStrong, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ ...price('sm'), marginTop: S[1] }}>{cost}</div>
        <div style={{ ...t('meta'), color: T.textMuted }}>{owners} owner{owners === 1 ? '' : 's'}</div>
      </div>
    </div>
  );
}

export function HomeScreen() {
  return (
    <>
      <div style={{ ...fakeInput, color: T.textMuted }}>Search items, brands, serials…</div>
      <div style={{ display: 'flex', gap: S[1], flexWrap: 'nowrap', overflow: 'hidden' }}>
        {['All', 'Sneakers', 'Watches', 'Bags'].map((c, i) => (
          <span key={c} style={{ ...t('meta'), fontWeight: 700, padding: `${S[1]}px ${S[3]}px`, borderRadius: 'var(--pill)', background: i === 0 ? 'var(--text-strong)' : 'var(--surface-bg)', color: i === 0 ? 'var(--bg-0)' : 'var(--text-muted)', border: '1px solid var(--glass-hairline)' }}>{c}</span>
        ))}
      </div>
      <div style={muted}>4 items for sale</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
        <Listing kind="shoe" name="Runner 01" cost="$300" owners={2} />
        <Listing kind="watch" name="Heritage Chrono" cost="$1,150" owners={3} />
        <Listing kind="bag" name="Canvas Tote" cost="$420" owners={1} />
        <Listing kind="shoe" name="Court Low" cost="$180" owners={2} />
      </div>
    </>
  );
}

export function ItemScreen() {
  return (
    <>
      <Thumb kind="shoe" h={120}>
        <span style={{ ...badge('onImage'), position: 'absolute', top: S[2], left: S[2] }}>Used</span>
      </Thumb>
      <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
        <span style={badge('default')}>Sneakers</span>
        <BrandBadge status="verified" brand="Northline" />
      </div>
      <div style={{ ...row, alignItems: 'flex-start' }}>
        <div style={{ ...t('heading'), color: T.textStrong }}>{ITEM}</div>
        <AuthBadge status="authenticated" />
      </div>
      <div style={btn('primary', { full: true })}>Buy Now · $300</div>
      <div style={muted}>Free shipping on every order. The seller is paid only after you confirm delivery.</div>
      <TallyCard name={ITEM} serial={SERIAL} owners={[OWNER_BRAND, OWNER_SELLER]} />
    </>
  );
}

export function CheckoutScreen() {
  const tabs = tabSlider();
  return (
    <>
      <div style={{ ...t('heading'), color: T.textStrong }}>Checkout</div>
      <ItemRow sub="Sold by Maya" />
      <div style={tabs.wrap}>
        {['Card', 'Crypto', 'Bank'].map((x, i) => <span key={x} style={{ ...tabs.item, ...(i === 0 ? tabs.itemActive : null), padding: '7px 8px' }}>{x}</span>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[1], ...muted }}>
        <div style={row}><span>Item</span><span>$300.00</span></div>
        <div style={row}><span>Shipping</span><span style={{ color: 'var(--ok)', fontWeight: 700 }}>Free</span></div>
        <div style={{ ...row, color: T.textStrong, fontWeight: 700, paddingTop: S[1], borderTop: '1px solid var(--divider)' }}><span>You pay</span><span>$300.00</span></div>
      </div>
      <div style={fakeInput}><span style={muted}>Ship to</span><div style={{ color: T.text }}>Jordan Lee · 24 Maple St</div></div>
      <div style={btn('primary', { full: true })}>Pay with Visa ····4242</div>
    </>
  );
}

export function OrderScreen({ stage }: { stage: 'shipping' | 'delivered' }) {
  const done = stage === 'delivered';
  const steps = [
    { label: 'Payment received', sub: done ? 'Paid out to the seller' : 'Visby is holding it', done: true, current: false },
    { label: 'Shipped', sub: 'Tracking 9400 1118 9922', done: true, current: !done },
    { label: 'Delivered', sub: done ? 'You confirmed it' : 'Waiting for you', done, current: false },
  ];
  return (
    <>
      <div style={{ ...t('heading'), color: T.textStrong }}>{done ? 'Order delivered!' : 'Your order is on its way!'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        {steps.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
            <Check done={s.done && !s.current} current={s.current} />
            <div>
              <div style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>{s.label}</div>
              <div style={muted}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>
      {done ? (
        <>
          <TallyCard name={ITEM} serial={SERIAL} owners={[OWNER_BRAND, OWNER_SELLER, OWNER_YOU]} />
          <div style={muted}>The seller has been paid. You are now the owner on record.</div>
        </>
      ) : (
        <>
          <div style={{ ...btn('secondary', { full: true }) }}>Confirm delivery</div>
          <div style={muted}>Tap this when your item arrives. The seller is paid after that.</div>
        </>
      )}
    </>
  );
}

export function ResellScreen() {
  const tabs = tabSlider();
  return (
    <>
      <div style={tabs.wrap}>
        <span style={tabs.item}>Mint New</span>
        <span style={{ ...tabs.item, ...tabs.itemActive }}>Relist</span>
      </div>
      <ItemRow sub="3 owners" />
      <div style={fakeInput}>$300</div>
      <FeeRows />
      <div style={btn('primary', { full: true })}>List for sale</div>
    </>
  );
}

export function SaleScreen() {
  return (
    <>
      <span style={{ ...badge('success'), alignSelf: 'flex-start' }}>Buyer confirmed delivery</span>
      <ItemRow sub="Sold to Riley" />
      <FeeRows received="You received" />
      <div style={muted}>The Tally moved to the buyer.</div>
    </>
  );
}

export function HistoryScreen({ count = 3 }: { count?: 1 | 3 | 4 }) {
  const owners = { 1: [OWNER_BRAND], 3: [OWNER_BRAND, OWNER_SELLER, OWNER_YOU], 4: [OWNER_BRAND, OWNER_SELLER, OWNER_YOU, OWNER_NEXT] }[count];
  return <TallyCard name={ITEM} serial={SERIAL} owners={owners} />;
}

export function BadgesScreen() {
  return (
    <>
      <div style={col}>
        <AuthBadge status="authenticated" />
        <div style={muted}>A Visby reviewer checked this item.</div>
      </div>
      <div style={{ height: 1, background: 'var(--divider)' }} />
      <div style={col}>
        <BrandBadge status="verified" brand="Northline" />
        <div style={muted}>The serial number matches the numbers the brand registered.</div>
      </div>
    </>
  );
}

export function PayoutScreen() {
  const opts = [
    { name: 'Bank account', sub: 'Money goes to your bank', on: true },
    { name: 'Digital dollars (USDC)', sub: 'Paid in crypto', on: false },
  ];
  return (
    <>
      <div style={{ ...t('heading'), color: T.textStrong }}>How do you want to get paid?</div>
      {opts.map(o => (
        <div key={o.name} style={{ ...surface({ radius: 'var(--r)', pad: S[3] }), display: 'flex', alignItems: 'center', gap: S[3], borderColor: o.on ? 'var(--text-strong)' : undefined }}>
          <Check done={o.on} />
          <div>
            <div style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>{o.name}</div>
            <div style={muted}>{o.sub}</div>
          </div>
        </div>
      ))}
      <FeeRows />
    </>
  );
}

export function StoreScreen() {
  return (
    <>
      <div style={sectionLabel()}>northline.com</div>
      <Thumb kind="shoe" h={120} />
      <div style={row}>
        <div style={{ ...t('heading'), color: T.textStrong }}>{ITEM}</div>
        <span style={price('sm')}>$240</span>
      </div>
      <div style={btn('secondary', { full: true })}>Add to cart</div>
      <div style={btn('primary', { full: true })}>Pay with Visby</div>
    </>
  );
}

export function PayCheckoutScreen() {
  return (
    <>
      <div style={{ ...t('heading'), color: T.textStrong }}>Visby Pay</div>
      <div style={muted}>Sold by Northline</div>
      <ItemRow sub="SN · RN01-0042-US10" />
      <div style={{ ...row, color: T.textStrong, fontWeight: 700, ...t('body') }}><span>You pay</span><span>$240.00</span></div>
      <div style={{ ...surface({ radius: 'var(--r)', pad: S[3] }), ...row }}><span style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>Visa ····4242</span><span style={badge('default')}>Default</span></div>
      <div style={btn('primary', { full: true })}>Pay $240.00</div>
    </>
  );
}

export function PayDoneScreen() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <Check done />
        <div style={{ ...t('heading'), color: T.textStrong }}>Your Tally is ready</div>
      </div>
      <TallyCard name={ITEM} serial={SERIAL} owners={[OWNER_YOU]} />
      <div style={muted}>You now own the verified history of this item.</div>
      <div style={{ ...t('meta'), color: T.textStrong, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Back to Northline</div>
    </>
  );
}
