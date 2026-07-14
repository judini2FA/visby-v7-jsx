'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

type Order = {
  id: string;
  item_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  price_usdc: number;
  pay_method: string | null;
  status: string;
  tracking_carrier: string | null;
  tracking_number: string | null;
  payout_released: boolean;
  platform_fee_usd: number;
  seller_net_usd: number;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
};

const money = (n: number, dp = 2) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const shortW = (w: string) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w || '—');
const STATUS_COLOR: Record<string, string> = { paid: '#2A8AED', shipped: '#FFB36B', delivered: '#00C48C', cancelled: 'var(--text-muted)', refunded: '#FF3B5C' };

const FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Paid', value: 'paid' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Refunded', value: 'refunded' },
];

export default function AdminOrders() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');

  useEffect(() => {
    if (!ready || !wallet) return;
    let cancelled = false;
    setOrders(null);
    setErr('');
    (async () => {
      try {
        const token = await getAccessToken();
        const params = new URLSearchParams({ wallet });
        if (status) params.set('status', status);
        if (submittedQ) params.set('q', submittedQ);
        const res = await fetch(`/api/admin/orders?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error || 'Failed to load');
        setOrders(Array.isArray(d.orders) ? d.orders : []);
      } catch (e: any) {
        if (!cancelled) setErr(friendlyError(e, 'Failed to load — try again.'));
      }
    })();
    return () => { cancelled = true; };
  }, [ready, wallet, status, submittedQ, getAccessToken]);

  const chip = useMemo(
    () => (active: boolean): React.CSSProperties => ({
      ...t('meta'),
      fontWeight: 700,
      padding: `${S[2]}px ${S[3]}px`,
      borderRadius: 'var(--pill)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      border: '1px solid var(--glass-hairline)',
      background: active ? 'var(--grad-brand)' : 'var(--surface-bg)',
      backgroundClip: 'border-box',
      backgroundOrigin: 'border-box',
      backgroundSize: '100% 100%',
      color: active ? 'var(--text-on-cta)' : 'var(--text-muted)',
      boxShadow: active ? '0 4px 14px rgba(89,180,245,.22)' : 'var(--box-shadow-soft)',
    }),
    [],
  );

  return (
    <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 120 }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[4] }}>Orders</div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: S[2], overflowX: 'auto', paddingBottom: S[1], marginBottom: S[3] }}>
        {FILTERS.map((f) => (
          <button key={f.value || 'all'} style={chip(status === f.value)} onClick={() => setStatus(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => { e.preventDefault(); setSubmittedQ(q.trim()); }}
        style={{ display: 'flex', gap: S[2], marginBottom: S[5] }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search buyer, seller, or item id"
          style={{
            flex: 1,
            ...t('body'),
            color: 'var(--text)',
            background: 'var(--field-input-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--r-sm)',
            padding: `${S[3]}px ${S[4]}px`,
            outline: 'none',
          }}
        />
        {submittedQ && (
          <button
            type="button"
            onClick={() => { setQ(''); setSubmittedQ(''); }}
            style={{ ...t('meta'), fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', borderRadius: 'var(--r-sm)', padding: `0 ${S[4]}px`, cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </form>

      {err && <div style={{ ...card({ pad: S[4] }), color: 'var(--danger)' }}>{err}</div>}
      {!orders && !err && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Loading…</div>}

      {orders && !err && orders.length === 0 && (
        <div style={{ ...card({ pad: S[5], radius: 'var(--r-lg)' }), textAlign: 'center', color: 'var(--text-muted)', ...t('meta') }}>
          {submittedQ || status ? 'No orders match this filter.' : 'No orders yet.'}
        </div>
      )}

      {orders && orders.length > 0 && (
        <div style={{ ...card({ pad: 0, radius: 'var(--r-lg)' }), overflow: 'hidden' }}>
          {orders.map((o, i) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: S[3], padding: `${S[4]}px`, borderTop: i ? '1px solid var(--divider)' : undefined }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 600 }}>
                  {shortW(o.buyer_wallet)} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>→</span> {shortW(o.seller_wallet)}
                </div>
                <div style={{ ...t('micro'), color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(o.created_at).toLocaleDateString()} · {(o.pay_method || '—').toUpperCase()}
                  {o.tracking_carrier ? ` · ${o.tracking_carrier}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: S[1], flexShrink: 0 }}>
                <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 700 }}>{money(o.price_usdc)}</div>
                <span style={{ ...t('micro'), color: STATUS_COLOR[o.status] ?? 'var(--text-muted)', textTransform: 'capitalize' }}>{o.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
