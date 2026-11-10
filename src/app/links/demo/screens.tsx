import type { CSSProperties, ReactNode } from 'react';
import { t, S, T, btn, badge, price, surface, tabSlider } from '@/lib/ui';
import { TallyCard } from '@/components/tally-card';
import { AvatarCircle } from '@/components/owner-stack';

// Recreations of the real app screens, built from the same labels and design helpers, using real product
// photos and the real Nike website. Static: nothing here talks to an API. Names and amounts are examples.

type Owner = { wallet: string; avatar_url?: string };

const NIKE: Owner = { wallet: 'Nike', avatar_url: '/demo/nike-avatar.png' };
const MAYA: Owner = { wallet: 'Maya' };
const JORDAN: Owner = { wallet: 'Jordan' };
const RILEY: Owner = { wallet: 'Riley' };

const ITEM = "Air Force 1 '07";
const ITEM_FULL = "Nike Air Force 1 '07";
const SERIAL = 'CW2288-111-0042';
const PHOTO = '/demo/nike-af1.jpg';

const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] };
const fakeInput: CSSProperties = { ...t('body'), color: T.text, background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r)', padding: `${S[2]}px ${S[3]}px` };
const muted: CSSProperties = { ...t('meta'), color: T.textMuted };

function Photo({ src, h, children }: { src: string; h: number; children?: ReactNode }) {
  return (
    <div style={{ position: 'relative', height: h, borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', flexShrink: 0 }}>
      <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 55%', display: 'block' }} />
      {children}
    </div>
  );
}

function ItemRow({ sub, src = PHOTO, name = ITEM_FULL }: { sub: string; src?: string; name?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
      <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--glass-hairline)' }}>
        <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>{name}</div>
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
      <div style={row}><span>Price</span><span>$95.00</span></div>
      <div style={row}><span>Visby fee (9%)</span><span>−$8.55</span></div>
      <div style={{ ...row, color: T.textStrong, fontWeight: 700, paddingTop: S[1], borderTop: '1px solid var(--divider)' }}><span>{received}</span><span>$86.45</span></div>
    </div>
  );
}

function MinterNote() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S[2], ...muted }}>
      <AvatarCircle wallet="Nike" avatarUrl={NIKE.avatar_url} size={24} ring="var(--divider)" />
      <span>Original minter: <strong style={{ color: T.textStrong }}>Nike</strong></span>
    </div>
  );
}

const BRANDS = {
  nike: { src: '/demo/logo-nike.png', w: 268, h: 96, name: 'Nike' },
  rolex: { src: '/demo/logo-rolex.png', w: 530, h: 96, name: 'Rolex' },
  apple: { src: '/demo/logo-apple.png', w: 78, h: 96, name: 'Apple' },
  kay: { src: '/demo/logo-kay.png', w: 296, h: 96, name: 'Kay' },
} as const;
type BrandKey = keyof typeof BRANDS;

// The original minter's mark, sitting on the photo like a watermark.
function BrandPill({ brand }: { brand: BrandKey }) {
  const b = BRANDS[brand];
  const h = 12;
  return (
    <span title={`Original minter: ${b.name}`} style={{ position: 'absolute', top: S[2], left: S[2], background: 'rgba(255,255,255,.92)', borderRadius: 'var(--pill)', padding: '4px 8px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.12)' }}>
      <img src={b.src} alt="" width={Math.round((b.w / b.h) * h)} height={h} style={{ display: 'block', height: h, width: 'auto' }} />
    </span>
  );
}

function Listing({ src, name, cost, owners, brand }: { src: string; name: string; cost: string; owners: number; brand: BrandKey }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)' }}>
        <img src={src} alt="" width={640} height={640} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <BrandPill brand={brand} />
      </div>
      <div style={{ ...surface({ radius: 'var(--r)' }), position: 'relative', margin: `-${S[3]}px ${S[1]}px 0`, padding: S[2] }}>
        <div style={{ ...t('meta'), color: T.textStrong, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ ...price('sm'), marginTop: S[1] }}>{cost}</div>
        <div style={{ ...t('meta'), color: T.textMuted }}>{owners} owners</div>
      </div>
    </div>
  );
}

const LISTINGS: { src: string; name: string; cost: string; owners: number; brand: BrandKey }[] = [
  { src: '/demo/nike-af1.jpg', name: "Air Force 1 '07", cost: '$95', owners: 2, brand: 'nike' },
  { src: '/demo/rolex-submariner.jpg', name: 'Submariner', cost: '$14,200', owners: 3, brand: 'rolex' },
  { src: '/demo/apple-airpods.jpg', name: 'AirPods Pro 3', cost: '$190', owners: 2, brand: 'apple' },
  { src: '/demo/kay-ring-leo.jpg', name: 'Diamond Ring', cost: '$3,200', owners: 2, brand: 'kay' },
  { src: '/demo/nike-aj6.jpg', name: 'Air Jordan 6', cost: '$240', owners: 3, brand: 'nike' },
  { src: '/demo/rolex-datejust.jpg', name: 'Datejust 36', cost: '$9,800', owners: 2, brand: 'rolex' },
  { src: '/demo/apple-watch.jpg', name: 'Watch Ultra', cost: '$620', owners: 2, brand: 'apple' },
  { src: '/demo/kay-ring-nf.jpg', name: 'Round Ring', cost: '$1,150', owners: 2, brand: 'kay' },
];

export const DEMO_IMAGES: string[] = [
  ...LISTINGS.map(l => l.src), ...Object.values(BRANDS).map(b => b.src),
  '/demo/nike-avatar.png', '/demo/visbypay-button.png', '/demo/nike-product.jpg', '/demo/nike-checkout.jpg',
];

export function HomeScreen() {
  return (
    <>
      <div style={{ ...fakeInput, color: T.textMuted }}>Search items, brands, serials…</div>
      <div style={{ display: 'flex', gap: S[1], flexWrap: 'nowrap', overflow: 'hidden' }}>
        {['All', 'Shoes', 'Watches', 'Tech', 'Rings'].map((c, i) => (
          <span key={c} style={{ ...t('meta'), fontWeight: 700, padding: `${S[1]}px ${S[3]}px`, borderRadius: 'var(--pill)', background: i === 0 ? 'var(--text-strong)' : 'var(--surface-bg)', color: i === 0 ? 'var(--bg-0)' : 'var(--text-muted)', border: '1px solid var(--glass-hairline)' }}>{c}</span>
        ))}
      </div>
      <div style={muted}>{LISTINGS.length} items for sale</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
        {LISTINGS.map(l => <Listing key={l.src} {...l} />)}
      </div>
    </>
  );
}

export function ItemScreen() {
  return (
    <>
      <Photo src={PHOTO} h={132}>
        <BrandPill brand="nike" />
        <span style={{ ...badge('onImage'), position: 'absolute', top: S[2], right: S[2] }}>Used</span>
      </Photo>
      <div style={{ ...t('heading'), color: T.textStrong }}>{ITEM_FULL}</div>
      <div style={row}>
        <span style={price('md')}>$95</span>
        <span style={badge('default')}>Sneakers</span>
      </div>
      <div style={btn('primary', { full: true })}>Buy Now · $95</div>
      <div style={muted}>Free shipping on every order. The seller is paid only after you confirm delivery.</div>
      <TallyCard name={ITEM} serial={SERIAL} owners={[NIKE, MAYA]} />
      <MinterNote />
    </>
  );
}

export function CheckoutScreen() {
  const tabs = tabSlider();
  return (
    <>
      <div style={{ ...t('heading'), color: T.textStrong }}>Checkout</div>
      <ItemRow sub="Sold by Maya" name={ITEM} />
      <div style={tabs.wrap}>
        {['Card', 'Crypto', 'Bank'].map((x, i) => <span key={x} style={{ ...tabs.item, ...(i === 0 ? tabs.itemActive : null), padding: '7px 8px' }}>{x}</span>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[1], ...muted }}>
        <div style={row}><span>Item</span><span>$95.00</span></div>
        <div style={row}><span>Shipping</span><span style={{ color: 'var(--ok)', fontWeight: 700 }}>Free</span></div>
        <div style={{ ...row, color: T.textStrong, fontWeight: 700, paddingTop: S[1], borderTop: '1px solid var(--divider)' }}><span>You pay</span><span>$95.00</span></div>
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
          <TallyCard name={ITEM} serial={SERIAL} owners={[NIKE, MAYA, JORDAN]} />
          <div style={muted}>The seller has been paid. You are now the owner on record.</div>
        </>
      ) : (
        <>
          <div style={btn('secondary', { full: true })}>Confirm delivery</div>
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
      <ItemRow sub="3 owners" name={ITEM} />
      <div style={fakeInput}>$95</div>
      <FeeRows />
      <div style={btn('primary', { full: true })}>List for sale</div>
    </>
  );
}

export function SaleScreen() {
  return (
    <>
      <span style={{ ...badge('success'), alignSelf: 'flex-start' }}>Buyer confirmed delivery</span>
      <ItemRow sub="Sold to Riley" name={ITEM} />
      <FeeRows received="You received" />
      <div style={muted}>The Tally moved to the buyer.</div>
    </>
  );
}

export function HistoryScreen({ count = 3 }: { count?: 1 | 3 | 4 }) {
  const owners = { 1: [NIKE], 3: [NIKE, MAYA, JORDAN], 4: [NIKE, MAYA, JORDAN, RILEY] }[count];
  return (
    <>
      <TallyCard name={ITEM} serial={SERIAL} owners={owners} />
      <MinterNote />
    </>
  );
}

export function ChainScreen() {
  const links: { who: Owner; name: string; role: string }[] = [
    { who: NIKE, name: 'Nike', role: 'Original minter' },
    { who: MAYA, name: 'Maya', role: 'Bought it from Nike' },
    { who: JORDAN, name: 'Jordan', role: 'Current owner' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {links.map((l, i) => (
        <div key={l.name} style={{ display: 'flex', gap: S[3] }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <AvatarCircle wallet={l.who.wallet} avatarUrl={l.who.avatar_url} size={36} ring="var(--divider)" />
            {i < links.length - 1 && <div style={{ width: 2, flex: 1, minHeight: S[4], background: 'var(--divider)' }} />}
          </div>
          <div style={{ paddingBottom: i < links.length - 1 ? S[3] : 0 }}>
            <div style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>{l.name}</div>
            <div style={muted}>{l.role}</div>
          </div>
        </div>
      ))}
    </div>
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

export function ShotScreen({ src, width, height }: { src: string; width: number; height: number }) {
  return <img src={src} alt="" width={width} height={height} style={{ width: '100%', height: 'auto', display: 'block' }} />;
}

export function PayCheckoutScreen() {
  return (
    <>
      <img src="/demo/visbypay-button.png" alt="VisbyPay" width={180} height={29} style={{ display: 'block', width: 180, height: 'auto' }} />
      <div style={muted}>Sold by Nike</div>
      <ItemRow sub={`SN · ${SERIAL}`} name={ITEM} />
      <div style={{ ...row, color: T.textStrong, fontWeight: 700, ...t('body') }}><span>You pay</span><span>$115.00</span></div>
      <div style={{ ...surface({ radius: 'var(--r)', pad: S[3] }), ...row }}><span style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>Visa ····4242</span><span style={badge('default')}>Default</span></div>
      <div style={btn('primary', { full: true })}>Pay $115.00</div>
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
      <TallyCard name={ITEM} serial={SERIAL} owners={[NIKE, JORDAN]} />
      <MinterNote />
      <div style={muted}>You now own the verified history of this item.</div>
      <div style={{ ...t('meta'), color: T.textStrong, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Back to Nike</div>
    </>
  );
}
