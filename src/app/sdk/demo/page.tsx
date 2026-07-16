'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Burner test storefront for the "Pay with Visby" SDK. Deliberately does NOT use the Visby app shell or
// design tokens — it looks like a random third-party merchant site so the SDK integration is exercised
// exactly as an external merchant would: POST for a checkout session server-side, open the returned
// checkout_url in a popup, listen for the 'visby:complete' postMessage. Single "Buy now" and a
// multi-item cart ("Checkout with VisbyPay") both route through /api/sdk/demo-session.

type DemoProduct = { product_id: string; name: string; price: number; image?: string };

const IMG = 'https://rwdwzigqtfezbyqkfqfx.supabase.co/storage/v1/object/public/item-images';
const PRODUCTS: DemoProduct[] = [
  { product_id: 'demo-sneaker', name: 'Demo Runner Sneaker', price: 0.99, image: `${IMG}/items/1782340185687-uxedsifug2h.jpg` },
  { product_id: 'demo-headphones', name: 'Demo Wireless Headphones', price: 2.49, image: `${IMG}/demo/headphones-raw.jpg` },
  { product_id: 'demo-bag', name: 'Demo Leather Bag', price: 4.99, image: `${IMG}/demo/bag-raw.jpg` },
];

type LogEntry = {
  id: string;
  label: string;
  orderIds: string[];
  time: string;
  status: 'awaiting payment' | 'completed';
  result?: string;
};

const isCut = (u?: string) => !!u && /\.png(\?|$)/i.test(u);

function ProductArt({ image, name }: { image?: string; name: string }) {
  if (!image) return <div style={{ width: '100%', height: 120, borderRadius: 8, background: '#eee' }} />;
  return (
    <div style={{ width: '100%', height: 120, borderRadius: 8, background: isCut(image) ? 'transparent' : '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <img src={image} alt={name} style={{ width: '100%', height: '100%', objectFit: isCut(image) ? 'contain' : 'cover' }} />
    </div>
  );
}

export default function SdkDemoPage() {
  const [cart, setCart] = useState<DemoProduct[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // product_id or 'cart' while creating a session
  const [modalUrl, setModalUrl] = useState<string | null>(null); // checkout shown in an in-page iframe modal
  const logRef = useRef<LogEntry[]>([]);
  logRef.current = log;

  // The checkout (iframe) posts visby:complete / visby:close to us (window.parent). React to both.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d: any = e.data;
      if (!d || d.source !== 'visby') return;
      if (d.type === 'visby:close') { setModalUrl(null); return; }
      if (d.type !== 'visby:complete') return;
      const entry = logRef.current.find(l =>
        l.status !== 'completed' && (l.orderIds.includes(d.order_id) || (d.cart && l.orderIds.length > 1))
      ) || logRef.current.find(l => l.status !== 'completed');
      if (!entry) return;
      const result = d.cart
        ? `${(d.results ?? []).filter((r: any) => r.nft_address).length} Tallys`
        : (d.nft_address ? `NFT ${d.nft_address}` : 'paid');
      setLog(prev => prev.map(l => (l.id === entry.id ? { ...l, status: 'completed', result } : l)));
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const openCheckout = useCallback((body: { product_id?: string; product_ids?: string[] }, label: string, busyKey: string) => {
    setError(null);
    setBusy(busyKey);
    fetch('/api/sdk/demo-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || typeof j?.checkout_url !== 'string') throw new Error(j?.error || 'Could not start checkout');
        setModalUrl(j.checkout_url); // show checkout in an in-page modal (iframe), not a separate window
        setLog(prev => [{ id: crypto.randomUUID(), label, orderIds: j.order_ids ?? [], time: new Date().toLocaleTimeString(), status: 'awaiting payment' }, ...prev]);
      })
      .catch(err => setError(err?.message || 'Something went wrong'))
      .finally(() => setBusy(null));
  }, []);

  const buyNow = (p: DemoProduct) => openCheckout({ product_id: p.product_id }, p.name, p.product_id);
  const checkoutCart = () => openCheckout({ product_ids: cart.map(p => p.product_id) }, `Cart · ${cart.length} items`, 'cart');
  const addToCart = (p: DemoProduct) => setCart(prev => [...prev, p]);
  const removeFromCart = (i: number) => setCart(prev => prev.filter((_, idx) => idx !== i));

  const cartTotal = cart.reduce((s, p) => s + p.price, 0);

  return (
    <div style={styles.page}>
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
            <button style={styles.buyBtn} onClick={() => buyNow(p)} disabled={busy === p.product_id}>
              {busy === p.product_id ? 'Opening…' : 'Buy now'}
            </button>
            <button style={styles.cartBtn} onClick={() => addToCart(p)}>Add to cart</button>
          </div>
        ))}
      </div>

      {error && <div style={styles.errorBar}>{error}</div>}

      {modalUrl && (
        <div style={styles.modalOverlay} onClick={() => setModalUrl(null)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setModalUrl(null)} aria-label="Close">×</button>
            <iframe src={modalUrl} title="Pay with Visby" style={styles.modalIframe} />
          </div>
        </div>
      )}

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
              {busy === 'cart' ? 'Opening…' : 'Checkout with VisbyPay'}
            </button>
          </div>
        </div>
      )}

      <div style={styles.logPanel}>
        <div style={styles.logTitle}>Checkout log</div>
        {log.length === 0
          ? <div style={styles.logEmpty}>No checkouts yet — try Buy now or add items to the cart.</div>
          : (
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>What</th><th style={styles.th}>Orders</th><th style={styles.th}>Time</th><th style={styles.th}>Status</th><th style={styles.th}>Result</th></tr></thead>
              <tbody>
                {log.map(e => (
                  <tr key={e.id}>
                    <td style={styles.td}>{e.label}</td>
                    <td style={styles.td}>{e.orderIds.length}</td>
                    <td style={styles.td}>{e.time}</td>
                    <td style={{ ...styles.td, color: e.status === 'completed' ? '#1a7f37' : '#a15c00' }}>{e.status}</td>
                    <td style={styles.td}>{e.result ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f4f4', color: '#1a1a1a', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', padding: '0 0 120px' },
  banner: { background: '#fff3cd', color: '#664d03', textAlign: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 600, borderBottom: '1px solid #ffe69c' },
  header: { maxWidth: 900, margin: '0 auto', padding: '32px 20px 8px', textAlign: 'center' },
  h1: { fontSize: 28, margin: '0 0 6px', fontWeight: 700 },
  sub: { fontSize: 14, color: '#555', margin: 0 },
  grid: { maxWidth: 900, margin: '24px auto', padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 },
  card: { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'stretch' },
  cardName: { fontSize: 15, fontWeight: 600, marginTop: 12 },
  cardPrice: { fontSize: 14, color: '#555', marginBottom: 10 },
  buyBtn: { padding: '9px 14px', borderRadius: 6, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cartBtn: { padding: '8px 14px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#1a1a1a', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  errorBar: { maxWidth: 900, margin: '0 auto', padding: '0 20px', color: '#b3261e', fontSize: 13 },
  cartBar: { position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #e0e0e0', boxShadow: '0 -2px 12px rgba(0,0,0,.06)', zIndex: 50 },
  cartInner: { maxWidth: 900, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16 },
  cartChip: { display: 'inline-block', background: '#f0f0f0', borderRadius: 12, padding: '2px 8px', marginRight: 6, marginBottom: 4 },
  chipX: { cursor: 'pointer', color: '#b3261e', fontWeight: 700, marginLeft: 2 },
  checkoutBtn: { padding: '11px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(90deg,#7bd6c9,#b7a6e0)', color: '#1a1a1a', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(10,10,14,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  modalBox: { position: 'relative', width: '100%', maxWidth: 440, height: 'min(760px, 92vh)', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.4)' },
  modalClose: { position: 'absolute', top: 8, right: 10, zIndex: 2, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.06)', color: '#333', fontSize: 20, lineHeight: '30px', cursor: 'pointer' },
  modalIframe: { width: '100%', height: '100%', border: 'none' },
  logPanel: { maxWidth: 900, margin: '20px auto 0', padding: '0 20px' },
  logTitle: { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  logEmpty: { fontSize: 13, color: '#777' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e0e0e0', color: '#555' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee' },
};
