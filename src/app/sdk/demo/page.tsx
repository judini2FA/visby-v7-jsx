'use client';

import { useEffect, useState } from 'react';

// Burner test storefront for the "Pay with Visby" SDK. Deliberately does NOT use the Visby app shell or
// design tokens — it looks like a random third-party merchant site so the SDK integration is exercised
// exactly as an external merchant would: POST to create a checkout session, then a same-tab redirect to
// the returned checkout_url. Popups and iframes were tried previously and broke Privy's embedded wallet /
// browser popup blockers — a plain top-level redirect is the reliable path, matching how real merchants
// hand off to a hosted checkout. The buyer returns here via success_url (?view=dashboard) after paying.

type DemoProduct = { product_id: string; code: string; name: string; price: number; image?: string };

const IMG = 'https://rwdwzigqtfezbyqkfqfx.supabase.co/storage/v1/object/public/item-images';
const PRODUCTS: DemoProduct[] = [
  { product_id: 'demo-sneaker', code: 'SNK', name: 'Demo Runner Sneaker', price: 0.99, image: `${IMG}/items/1782340185687-uxedsifug2h.jpg` },
  { product_id: 'demo-headphones', code: 'HDP', name: 'Demo Wireless Headphones', price: 2.49, image: `${IMG}/demo/headphones-raw.jpg` },
  { product_id: 'demo-bag', code: 'BAG', name: 'Demo Leather Bag', price: 4.99, image: `${IMG}/demo/bag-raw.jpg` },
];

const isCut = (u?: string) => !!u && /\.png(\?|$)/i.test(u);

function ProductArt({ image, name }: { image?: string; name: string }) {
  if (!image) return <div style={{ width: '100%', height: 120, borderRadius: 8, background: '#eee' }} />;
  return (
    <div style={{ width: '100%', height: 120, borderRadius: 8, background: isCut(image) ? 'transparent' : '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <img src={image} alt={name} style={{ width: '100%', height: '100%', objectFit: isCut(image) ? 'contain' : 'cover' }} />
    </div>
  );
}

const randAlnum = (n: number) => Array.from({ length: n }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
const makeSerial = (code: string) => `VBY-${code}-${Date.now().toString(36).toUpperCase()}-${randAlnum(4)}`;

const money = (n: number) => '$' + Number(n || 0).toFixed(2);
const shortId = (s: string | null | undefined) => (s ? s.slice(0, 6) + '…' + s.slice(-6) : '—');

type SentItem = { session_id: string; product_id: string; product_name: string; serial_number: string; price: number };
type SentRecord = { id: string; time: string; items: SentItem[] };

type Order = {
  id: string;
  product_name: string;
  serial_number: string;
  price_usdc: number;
  currency: string;
  platform_fee_usd: number;
  merchant_net_usd: number;
  status: 'pending' | 'paid' | 'minted' | 'failed' | 'cancelled';
  pay_method: string | null;
  buyer_wallet: string | null;
  nft_mint_address: string | null;
  sol_signature: string | null;
  stripe_payment_intent: string | null;
  moov_transfer_id: string | null;
  merchant_payout_status: string | null;
  merchant_payout_tx: string | null;
  merchant_payout_at: string | null;
  created_at: string;
  paid_at: string | null;
  minted_at: string | null;
};

type Analytics = {
  merchant: { name: string; merchant_wallet: string; fee_bps: number } | null;
  funnel: { created: number; paid: number; minted: number; failed: number };
  revenue: { gross_usd: number; platform_fee_usd: number; merchant_net_usd: number; count: number };
  payouts: { paid_count: number; paid_usd: number; owed_count: number; owed_usd: number; by_status: Record<string, number> };
  pay_methods: Record<string, number>;
  orders: Order[];
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#a15c00',
  paid: '#0a58ca',
  minted: '#1a7f37',
  failed: '#b3261e',
  cancelled: '#666',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] || '#666';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, color: '#fff', background: color }}>
      {status}
    </span>
  );
}

export default function SdkDemoPage() {
  const [view, setView] = useState<'shop' | 'dashboard'>('shop');
  const [cart, setCart] = useState<DemoProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // product_id or 'cart' while creating a session

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'dashboard') setView('dashboard');
  }, []);

  const cartTotal = cart.reduce((s, p) => s + p.price, 0);

  async function startCheckout(products: DemoProduct[], busyKey: string) {
    setError(null);
    setBusy(busyKey);
    try {
      const items = products.map(p => ({ product_id: p.product_id, serial_number: makeSerial(p.code) }));
      const r = await fetch('/api/sdk/demo-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const j = await r.json();
      if (!r.ok || typeof j?.checkout_url !== 'string') throw new Error(j?.error || 'Could not start checkout');

      const record: SentRecord = { id: crypto.randomUUID(), time: new Date().toISOString(), items: j.items ?? [] };
      try {
        const raw = localStorage.getItem('visby_demo_sent');
        const prev: SentRecord[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem('visby_demo_sent', JSON.stringify([record, ...prev].slice(0, 20)));
      } catch {}

      window.location.href = j.checkout_url;
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
      setBusy(null);
    }
  }

  const buyNow = (p: DemoProduct) => startCheckout([p], p.product_id);
  const checkoutCart = () => startCheckout(cart, 'cart');
  const addToCart = (p: DemoProduct) => setCart(prev => [...prev, p]);
  const removeFromCart = (i: number) => setCart(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div style={styles.page}>
      <div style={styles.tabBar}>
        <button style={{ ...styles.tabBtn, ...(view === 'shop' ? styles.tabBtnActive : {}) }} onClick={() => setView('shop')}>Shop</button>
        <button style={{ ...styles.tabBtn, ...(view === 'dashboard' ? styles.tabBtnActive : {}) }} onClick={() => setView('dashboard')}>Dashboard</button>
      </div>

      {view === 'shop' ? (
        <ShopView
          cart={cart}
          error={error}
          busy={busy}
          cartTotal={cartTotal}
          buyNow={buyNow}
          checkoutCart={checkoutCart}
          addToCart={addToCart}
          removeFromCart={removeFromCart}
        />
      ) : (
        <DashboardView active={view === 'dashboard'} />
      )}
    </div>
  );
}

function ShopView({
  cart, error, busy, cartTotal, buyNow, checkoutCart, addToCart, removeFromCart,
}: {
  cart: DemoProduct[];
  error: string | null;
  busy: string | null;
  cartTotal: number;
  buyNow: (p: DemoProduct) => void;
  checkoutCart: () => void;
  addToCart: (p: DemoProduct) => void;
  removeFromCart: (i: number) => void;
}) {
  return (
    <>
      <div style={styles.banner}>Burner test shop — fake products, sandbox payments. For SDK testing only.</div>
      <div style={styles.header}>
        <h1 style={styles.h1}>Visby Demo Shop</h1>
        <p style={styles.sub}>A fake third-party storefront wired to the real &quot;Pay with Visby&quot; SDK — single Buy now, or a multi-item cart.</p>
      </div>

      <div style={styles.grid}>
        {PRODUCTS.map(p => (
          <div key={p.product_id} style={styles.card}>
            <ProductArt image={p.image} name={p.name} />
            <div style={styles.cardName}>{p.name}</div>
            <div style={styles.cardPrice}>${p.price.toFixed(2)}</div>
            <button style={styles.buyBtn} onClick={() => buyNow(p)} disabled={!!busy}>
              {busy === p.product_id ? 'Redirecting…' : 'Buy now'}
            </button>
            <button style={styles.cartBtn} onClick={() => addToCart(p)} disabled={!!busy}>Add to cart</button>
          </div>
        ))}
      </div>
      <div style={styles.noteText}>Checkout opens on Visby&apos;s secure page and returns you here.</div>

      {error && <div style={styles.errorBar}>{error}</div>}

      {cart.length > 0 && (
        <div style={styles.cartBar}>
          <div style={styles.cartInner}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Cart · {cart.length} item{cart.length === 1 ? '' : 's'} · ${cartTotal.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                {cart.map((p, i) => (
                  <span key={i} style={styles.cartChip}>
                    {p.name} <span onClick={() => removeFromCart(i)} style={styles.chipX}>×</span>
                  </span>
                ))}
              </div>
            </div>
            <button style={styles.checkoutBtn} onClick={checkoutCart} disabled={busy === 'cart'}>
              {busy === 'cart' ? 'Redirecting…' : 'Checkout with VisbyPay'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DashboardView({ active }: { active: boolean }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<SentRecord[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('visby_demo_sent');
      setSent(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);

  async function load() {
    try {
      const r = await fetch('/api/sdk/demo-analytics');
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to load analytics');
      setData(j);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [active]);

  if (loading) return <div style={styles.dashWrap}><div style={styles.logEmpty}>Loading dashboard…</div></div>;
  if (err) return <div style={styles.dashWrap}><div style={styles.errorBar}>{err}</div></div>;
  if (!data) return null;

  const { merchant, funnel, revenue, payouts, pay_methods, orders } = data;
  const paidPct = funnel.created ? Math.round((funnel.paid / funnel.created) * 100) : 0;
  const mintedPct = funnel.paid ? Math.round((funnel.minted / funnel.paid) * 100) : 0;

  const allSentItems = sent.flatMap(r => r.items.map(it => ({ ...it, sentAt: r.time })));

  return (
    <div style={styles.dashWrap}>
      <div style={styles.dashHeaderRow}>
        <button style={styles.refreshBtn} onClick={load}>Refresh</button>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Store</div>
        {merchant ? (
          <div style={{ fontSize: 13, color: '#333' }}>
            <div><strong>{merchant.name}</strong></div>
            <div>Wallet: {shortId(merchant.merchant_wallet)}</div>
            <div>Fee: {(merchant.fee_bps / 100).toFixed(2)}%</div>
          </div>
        ) : (
          <div style={styles.logEmpty}>No merchant configured.</div>
        )}
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Conversion funnel</div>
        <div style={styles.kpiRow}>
          <div style={styles.kpi}>
            <div style={styles.kpiNum}>{funnel.created}</div>
            <div style={styles.kpiLabel}>Created</div>
          </div>
          <div style={styles.kpi}>
            <div style={styles.kpiNum}>{funnel.paid}</div>
            <div style={styles.kpiLabel}>Paid ({paidPct}%)</div>
          </div>
          <div style={styles.kpi}>
            <div style={styles.kpiNum}>{funnel.minted}</div>
            <div style={styles.kpiLabel}>Minted ({mintedPct}%)</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#a15c00', marginTop: 8 }}>Failed: {funnel.failed} (paid but mint failed)</div>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Revenue</div>
        <div style={styles.kpiRow}>
          <div style={styles.kpi}>
            <div style={styles.kpiNum}>{money(revenue.gross_usd)}</div>
            <div style={styles.kpiLabel}>Gross</div>
          </div>
          <div style={styles.kpi}>
            <div style={styles.kpiNum}>{money(revenue.platform_fee_usd)}</div>
            <div style={styles.kpiLabel}>Platform fees</div>
          </div>
          <div style={styles.kpi}>
            <div style={styles.kpiNum}>{money(revenue.merchant_net_usd)}</div>
            <div style={styles.kpiLabel}>Store net</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#777', marginTop: 8 }}>Over {revenue.count} settled orders</div>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Payouts</div>
        <div style={styles.kpiRow}>
          <div style={styles.kpi}>
            <div style={styles.kpiNum}>{money(payouts.paid_usd)}</div>
            <div style={styles.kpiLabel}>Paid out ({payouts.paid_count})</div>
          </div>
          <div style={styles.kpi}>
            <div style={styles.kpiNum}>{money(payouts.owed_usd)}</div>
            <div style={styles.kpiLabel}>Owed ({payouts.owed_count})</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          {Object.entries(payouts.by_status).map(([k, v]) => (
            <span key={k} style={styles.statusChip}>{k}: {v}</span>
          ))}
        </div>
        {payouts.owed_usd > 0 && payouts.paid_usd === 0 && (
          <div style={styles.amberNote}>Payouts are queued/failing — nothing has been paid out to the store wallet yet.</div>
        )}
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Payment methods</div>
        <div style={{ fontSize: 13, color: '#333' }}>
          {Object.keys(pay_methods).length === 0
            ? <span style={styles.logEmpty}>No settled payments yet.</span>
            : Object.entries(pay_methods).map(([k, v]) => <span key={k} style={{ marginRight: 16 }}>{k === 'card' ? 'Card' : k === 'crypto' ? 'Crypto' : k} {v}</span>)}
        </div>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Serial provenance</div>
        <div style={{ fontSize: 12, color: '#777', marginBottom: 10 }}>These serials were generated by THIS store and passed to Visby unchanged.</div>
        {allSentItems.length === 0 ? (
          <div style={styles.logEmpty}>No serials sent yet — buy something in the Shop tab.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Serial</th>
                  <th style={styles.th}>Sent at</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {allSentItems.map((it, i) => {
                  const match = orders.find(o => o.serial_number === it.serial_number);
                  return (
                    <tr key={i}>
                      <td style={styles.td}>{it.serial_number}</td>
                      <td style={styles.td}>{new Date(it.sentAt).toLocaleString()}</td>
                      <td style={{ ...styles.td, color: match ? '#1a7f37' : '#a15c00' }}>
                        {match ? `✓ matched on order (${match.status})` : 'not settled yet'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Orders</div>
        {orders.length === 0 ? (
          <div style={styles.logEmpty}>No checkouts yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Serial</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Fee</th>
                  <th style={styles.th}>Net</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Pay method</th>
                  <th style={styles.th}>Buyer</th>
                  <th style={styles.th}>Mint</th>
                  <th style={styles.th}>Payout</th>
                  <th style={styles.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td style={styles.td}>{o.product_name}</td>
                    <td style={styles.td}>{o.serial_number}</td>
                    <td style={styles.td}>{money(o.price_usdc)}</td>
                    <td style={styles.td}>{money(o.platform_fee_usd)}</td>
                    <td style={styles.td}>{money(o.merchant_net_usd)}</td>
                    <td style={styles.td}><StatusBadge status={o.status} /></td>
                    <td style={styles.td}>{o.pay_method ?? '—'}</td>
                    <td style={styles.td}>{shortId(o.buyer_wallet)}</td>
                    <td style={styles.td}>{shortId(o.nft_mint_address)}</td>
                    <td style={styles.td}>{o.merchant_payout_status ?? '—'}</td>
                    <td style={styles.td}>{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f4f4', color: '#1a1a1a', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', padding: '0 0 120px' },
  tabBar: { display: 'flex', gap: 0, maxWidth: 900, margin: '0 auto', padding: '16px 20px 0' },
  tabBtn: { padding: '10px 20px', border: '1px solid #ddd', background: '#fff', color: '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  tabBtnActive: { background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' },
  banner: { background: '#fff3cd', color: '#664d03', textAlign: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 600, borderBottom: '1px solid #ffe69c', marginTop: 16 },
  header: { maxWidth: 900, margin: '0 auto', padding: '32px 20px 8px', textAlign: 'center' },
  h1: { fontSize: 28, margin: '0 0 6px', fontWeight: 700 },
  sub: { fontSize: 14, color: '#555', margin: 0 },
  grid: { maxWidth: 900, margin: '24px auto', padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 },
  card: { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'stretch' },
  cardName: { fontSize: 15, fontWeight: 600, marginTop: 12 },
  cardPrice: { fontSize: 14, color: '#555', marginBottom: 10 },
  buyBtn: { padding: '9px 14px', borderRadius: 6, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cartBtn: { padding: '8px 14px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#1a1a1a', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  noteText: { maxWidth: 900, margin: '0 auto', padding: '0 20px', fontSize: 12, color: '#888', textAlign: 'center' },
  errorBar: { maxWidth: 900, margin: '12px auto 0', padding: '0 20px', color: '#b3261e', fontSize: 13 },
  cartBar: { position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #e0e0e0', boxShadow: '0 -2px 12px rgba(0,0,0,.06)', zIndex: 50 },
  cartInner: { maxWidth: 900, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16 },
  cartChip: { display: 'inline-block', background: '#f0f0f0', borderRadius: 12, padding: '2px 8px', marginRight: 6, marginBottom: 4 },
  chipX: { cursor: 'pointer', color: '#b3261e', fontWeight: 700, marginLeft: 2 },
  checkoutBtn: { padding: '11px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(90deg,#7bd6c9,#b7a6e0)', color: '#1a1a1a', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  dashWrap: { maxWidth: 900, margin: '0 auto', padding: '20px 20px 40px' },
  dashHeaderRow: { display: 'flex', justifyContent: 'flex-end', marginBottom: 12 },
  refreshBtn: { padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#1a1a1a', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  panel: { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 16, marginBottom: 16 },
  panelTitle: { fontSize: 15, fontWeight: 700, marginBottom: 12 },
  kpiRow: { display: 'flex', flexWrap: 'wrap', gap: 24 },
  kpi: { minWidth: 100 },
  kpiNum: { fontSize: 24, fontWeight: 700 },
  kpiLabel: { fontSize: 12, color: '#777', marginTop: 2 },
  statusChip: { display: 'inline-block', background: '#f0f0f0', borderRadius: 12, padding: '2px 10px', marginRight: 6, marginBottom: 4, fontSize: 12 },
  amberNote: { marginTop: 10, fontSize: 12, color: '#a15c00', background: '#fff3cd', border: '1px solid #ffe69c', borderRadius: 6, padding: '8px 10px' },
  logEmpty: { fontSize: 13, color: '#777' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e0e0e0', color: '#555', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
};
