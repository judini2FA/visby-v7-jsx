'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Burner test storefront for the "Pay with Visby" SDK. Deliberately does NOT use the Visby app shell
// or design tokens — this is meant to look/feel like a random third-party merchant site so the SDK
// integration is exercised exactly as an external merchant would experience it: load the button
// script, POST for a checkout session server-side, drop the returned checkout_url on <visby-button>,
// listen for 'visby:complete'. See src/app/api/sdk/demo-session/route.ts for the session bootstrap.

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'visby-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { 'checkout-url'?: string; label?: string },
        HTMLElement
      >;
    }
  }
}

type DemoProduct = { product_id: string; name: string; price: number; image?: string };

// Mirrors the fixed catalog in src/app/api/sdk/demo-session/route.ts (DEMO_CATALOG) — this copy is
// display-only; the server never trusts a client-supplied price.
const IMG = 'https://rwdwzigqtfezbyqkfqfx.supabase.co/storage/v1/object/public/item-images/items';
const PRODUCTS: DemoProduct[] = [
  { product_id: 'demo-sneaker', name: 'Demo Runner Sneaker', price: 0.99, image: `${IMG}/1782340185687-uxedsifug2h.jpg` },
  { product_id: 'demo-watch', name: 'Demo Chrono Watch', price: 2.49, image: `${IMG}/1783465001742-c2kdswzm91.png` },
  { product_id: 'demo-bag', name: 'Demo Leather Tote', price: 4.99, image: `${IMG}/1783617649961-1mohtcehgvq.png` },
];

type LogEntry = {
  serial: string;
  productId: string;
  product: string;
  time: string;
  status: 'awaiting payment' | 'completed';
  orderId?: string | null;
  nftAddress?: string | null;
};

const ART_COLOR: Record<string, string> = {
  'demo-sneaker': '#e8590c',
  'demo-watch': '#1971c2',
  'demo-bag': '#9c36b5',
};

// .png = transparent cutout (contain, no bg); .jpg = photo (cover, keeps its background) — mirrors isCutout().
const isCut = (u?: string) => !!u && /\.png(\?|$)/i.test(u);

function ProductArt({ productId, image, name }: { productId: string; image?: string; name: string }) {
  const color = ART_COLOR[productId] || '#666';
  if (image) {
    return (
      <div style={{ width: '100%', height: 120, borderRadius: 8, background: isCut(image) ? 'transparent' : '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <img src={image} alt={name} style={{ width: '100%', height: '100%', objectFit: isCut(image) ? 'contain' : 'cover' }} />
      </div>
    );
  }
  return (
    <svg viewBox="0 0 120 90" width="100%" height="90" role="img" aria-hidden="true">
      <rect width="120" height="90" rx="8" fill={color} opacity="0.12" />
      <circle cx="60" cy="45" r="26" fill={color} opacity="0.5" />
      <rect x="42" y="27" width="36" height="36" rx="6" fill={color} />
    </svg>
  );
}

function ProductCard({
  product,
  onSessionCreated,
  onButtonReady,
}: {
  product: DemoProduct;
  onSessionCreated: (entry: LogEntry) => void;
  onButtonReady: (productId: string, el: HTMLElement) => void;
}) {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachedRef = useRef(false);

  const attachButtonRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el || attachedRef.current) return;
      attachedRef.current = true;
      onButtonReady(product.product_id, el);
    },
    [onButtonReady, product.product_id]
  );

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sdk/demo-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.product_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json?.checkout_url !== 'string') {
        throw new Error(json?.error || `Could not start checkout (${res.status})`);
      }
      setCheckoutUrl(json.checkout_url);
      onSessionCreated({
        serial: json.serial_number,
        productId: product.product_id,
        product: product.name,
        time: new Date().toLocaleTimeString(),
        status: 'awaiting payment',
      });
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.card}>
      <ProductArt productId={product.product_id} image={product.image} name={product.name} />
      <div style={styles.cardName}>{product.name}</div>
      <div style={styles.cardPrice}>${product.price.toFixed(2)}</div>

      <button style={styles.startBtn} onClick={startCheckout} disabled={loading}>
        {loading ? 'Creating session…' : checkoutUrl ? 'New session' : 'Start checkout'}
      </button>

      <div style={{ marginTop: 10 }}>
        <visby-button ref={attachButtonRef} checkout-url={checkoutUrl ?? undefined} />
      </div>

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

export default function SdkDemoPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  // Latest serial issued per product — read at 'visby:complete' time (not closure-captured), so a
  // stale listener from an earlier session never mis-attributes a later completion.
  const latestSerialByProduct = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (document.querySelector('script[data-visby-sdk]')) return;
    const script = document.createElement('script');
    script.src = '/sdk/v1/button.js';
    script.async = true;
    script.setAttribute('data-visby-sdk', '1');
    document.body.appendChild(script);
  }, []);

  const handleSessionCreated = useCallback((entry: LogEntry) => {
    latestSerialByProduct.current.set(entry.productId, entry.serial);
    setLog(prev => [entry, ...prev]);
  }, []);

  const handleButtonReady = useCallback((productId: string, el: HTMLElement) => {
    el.addEventListener('visby:complete', (e: Event) => {
      const detail: any = (e as CustomEvent).detail || {};
      const serial = latestSerialByProduct.current.get(productId);
      if (!serial) return;
      setLog(prev =>
        prev.map(entry =>
          entry.serial === serial
            ? { ...entry, status: 'completed', orderId: detail.order_id ?? null, nftAddress: detail.nft_address ?? null }
            : entry
        )
      );
    });
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.banner}>
        Burner test shop — fake products, sandbox payments. For SDK testing only.
      </div>

      <div style={styles.header}>
        <h1 style={styles.h1}>Visby Demo Shop</h1>
        <p style={styles.sub}>A fake third-party storefront wired up with the real "Pay with Visby" SDK.</p>
      </div>

      <div style={styles.grid}>
        {PRODUCTS.map(p => (
          <ProductCard
            key={p.product_id}
            product={p}
            onSessionCreated={handleSessionCreated}
            onButtonReady={handleButtonReady}
          />
        ))}
      </div>

      <div style={styles.logPanel}>
        <div style={styles.logTitle}>Serial log</div>
        {log.length === 0 && (
          <div style={styles.logEmpty}>No sessions yet — click &quot;Start checkout&quot; on a product.</div>
        )}
        {log.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Serial</th>
                <th style={styles.th}>Product</th>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Order / NFT</th>
              </tr>
            </thead>
            <tbody>
              {log.map(entry => (
                <tr key={entry.serial}>
                  <td style={styles.td}>{entry.serial}</td>
                  <td style={styles.td}>{entry.product}</td>
                  <td style={styles.td}>{entry.time}</td>
                  <td style={{ ...styles.td, color: entry.status === 'completed' ? '#1a7f37' : '#a15c00' }}>
                    {entry.status}
                  </td>
                  <td style={styles.td}>
                    {entry.orderId ? `${entry.orderId}${entry.nftAddress ? ` / ${entry.nftAddress}` : ''}` : '—'}
                  </td>
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
  page: {
    minHeight: '100vh',
    background: '#f4f4f4',
    color: '#1a1a1a',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    padding: '0 0 60px',
  },
  banner: {
    background: '#fff3cd',
    color: '#664d03',
    textAlign: 'center',
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    borderBottom: '1px solid #ffe69c',
  },
  header: { maxWidth: 900, margin: '0 auto', padding: '32px 20px 8px', textAlign: 'center' },
  h1: { fontSize: 28, margin: '0 0 6px', fontWeight: 700 },
  sub: { fontSize: 14, color: '#555', margin: 0 },
  grid: {
    maxWidth: 900,
    margin: '24px auto',
    padding: '0 20px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 20,
  },
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  cardName: { fontSize: 15, fontWeight: 600, marginTop: 12 },
  cardPrice: { fontSize: 14, color: '#555', marginBottom: 8 },
  startBtn: {
    padding: '9px 14px',
    borderRadius: 6,
    border: '1px solid #ccc',
    background: '#f0f0f0',
    color: '#1a1a1a',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: '#b3261e', fontSize: 12, marginTop: 8 },
  logPanel: { maxWidth: 900, margin: '20px auto 0', padding: '0 20px' },
  logTitle: { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  logEmpty: { fontSize: 13, color: '#777' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e0e0e0', color: '#555' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee' },
};
