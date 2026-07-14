'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card, surface } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

type Overview = {
  orders: { total: number; byStatus: Record<string, number>; gmv: number; fees: number };
  payouts: { pendingCount: number; pendingUsd: number };
  activeListings: number;
  totalUsers: number;
  moderation: { openDisputes: number; pendingKyc: number; openReports: number };
  recent: { id: string; item_id: string; buyer_wallet: string; seller_wallet: string; price_usdc: number; status: string; pay_method: string; created_at: string }[];
};

const money = (n: number, dp = 0) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const shortW = (w: string) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w || '—');
const STATUS_COLOR: Record<string, string> = { paid: '#2A8AED', shipped: '#FFB36B', delivered: '#00C48C', cancelled: 'var(--text-muted)', refunded: '#FF3B5C' };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...surface({ pad: S[4], radius: 'var(--r-lg)' }) }}>
      <div style={{ ...t('micro'), color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ ...t('title'), color: 'var(--text-strong)', marginTop: S[1] }}>{value}</div>
      {sub && <div style={{ ...t('micro'), color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function AdminHome() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!ready || !wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/admin/overview?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error || 'Failed to load');
        setData(d);
      } catch (e: any) { if (!cancelled) setErr(friendlyError(e, 'Failed to load — try again.')); }
    })();
    return () => { cancelled = true; };
  }, [ready, wallet, getAccessToken]);

  return (
    <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 120 }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[4] }}>Overview</div>

      {err && <div style={{ ...surface({ pad: S[4] }), color: 'var(--danger)', marginBottom: S[4] }}>{err}</div>}
      {!data && !err && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Loading…</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: S[3], marginBottom: S[5] }}>
            <Kpi label="GMV" value={money(data.orders.gmv)} sub={`${data.orders.total} orders`} />
            <Kpi label="Platform fees" value={money(data.orders.fees, 2)} />
            <Kpi label="Pending payouts" value={money(data.payouts.pendingUsd, 2)} sub={`${data.payouts.pendingCount} awaiting`} />
            <Kpi label="Active listings" value={String(data.activeListings)} />
            <Kpi label="Users" value={String(data.totalUsers)} />
            <Kpi label="Delivered" value={String(data.orders.byStatus.delivered ?? 0)} sub={`${data.orders.byStatus.paid ?? 0} paid · ${data.orders.byStatus.shipped ?? 0} shipped`} />
          </div>

          {/* Needs-attention row */}
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[2] }}>Needs attention</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: S[3], marginBottom: S[5] }}>
            {[
              { label: 'Open disputes', n: data.moderation.openDisputes, href: '/admin/disputes' },
              { label: 'Pending KYC', n: data.moderation.pendingKyc, href: '/admin/kyc' },
              { label: 'Open reports', n: data.moderation.openReports, href: '/admin/reports' },
            ].map((m) => (
              <Link key={m.href} href={m.href} style={{ textDecoration: 'none', ...surface({ pad: S[4], radius: 'var(--r-lg)' }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: m.n > 0 ? '1px solid var(--glass-border)' : undefined }}>
                <span style={{ ...t('meta'), color: 'var(--text)' }}>{m.label}</span>
                <span style={{ ...t('heading'), color: m.n > 0 ? '#FFB36B' : 'var(--text-muted)' }}>{m.n}</span>
              </Link>
            ))}
          </div>

          {/* Recent orders */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[2] }}>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Recent orders</div>
            <Link href="/admin/orders" style={{ ...t('meta'), color: 'var(--text-strong)', textDecoration: 'none', fontWeight: 700 }}>View all →</Link>
          </div>
          <div style={{ ...card({ pad: 0, radius: 'var(--r-lg)' }), overflow: 'hidden' }}>
            {data.recent.length === 0 && <div style={{ ...t('meta'), color: 'var(--text-muted)', padding: S[4] }}>No orders yet.</div>}
            {data.recent.map((o, i) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: `${S[3]}px ${S[4]}px`, borderTop: i ? '1px solid var(--divider)' : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('meta'), color: 'var(--text-strong)' }}>{shortW(o.buyer_wallet)} <span style={{ color: 'var(--text-muted)' }}>bought from</span> {shortW(o.seller_wallet)}</div>
                  <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleDateString()} · {(o.pay_method || '—').toUpperCase()}</div>
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 700 }}>{money(o.price_usdc, 2)}</div>
                <span style={{ ...t('micro'), color: STATUS_COLOR[o.status] ?? 'var(--text-muted)', textTransform: 'capitalize', minWidth: 62, textAlign: 'right' }}>{o.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
