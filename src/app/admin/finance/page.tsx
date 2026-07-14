'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card, surface } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

type Finance = {
  gmv: number;
  fees: number;
  ordersCount: number;
  feesByChannel: { visby: number; sdk: number };
  payoutsByMethod: { card: number; crypto: number };
  released: { usd: number; count: number };
  pending: { usd: number; count: number };
  recentPayouts: {
    id: string;
    seller_wallet: string;
    seller_net_usd: number;
    payout_method: string | null;
    payout_tx: string | null;
    sale_channel: string | null;
    delivered_at: string;
  }[];
};

const money = (n: number, dp = 0) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const shortW = (w: string) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w || '—');
const METHOD_COLOR: Record<string, string> = { card: '#2A8AED', crypto: '#BC2DE6' };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...surface({ pad: S[4], radius: 'var(--r-lg)' }) }}>
      <div style={{ ...t('micro'), color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ ...t('title'), color: 'var(--text-strong)', marginTop: S[1] }}>{value}</div>
      {sub && <div style={{ ...t('micro'), color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div style={{ ...card({ pad: S[4], radius: 'var(--r-lg)' }) }}>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[3] }}>{title}</div>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: i ? S[2] : 0 }}>
          <span style={{ ...t('meta'), color: r.color ?? 'var(--text)', textTransform: 'capitalize' }}>{r.label}</span>
          <span style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 700 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminFinance() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [data, setData] = useState<Finance | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!ready || !wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/admin/finance?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
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
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[4] }}>Finance</div>

      {err && <div style={{ ...surface({ pad: S[4] }), color: 'var(--danger)', marginBottom: S[4] }}>{err}</div>}
      {!data && !err && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Loading…</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: S[3], marginBottom: S[5] }}>
            <Kpi label="GMV" value={money(data.gmv)} sub={`${data.ordersCount} orders`} />
            <Kpi label="Platform fees" value={money(data.fees, 2)} />
            <Kpi label="Released payouts" value={money(data.released.usd, 2)} sub={`${data.released.count} settled`} />
            <Kpi label="Pending payouts" value={money(data.pending.usd, 2)} sub={`${data.pending.count} awaiting`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: S[3], marginBottom: S[5] }}>
            <Breakdown
              title="Fees by channel"
              rows={[
                { label: 'Visby', value: money(data.feesByChannel.visby, 2) },
                { label: 'SDK', value: money(data.feesByChannel.sdk, 2) },
              ]}
            />
            <Breakdown
              title="Payouts by method"
              rows={[
                { label: 'Card', value: money(data.payoutsByMethod.card, 2), color: METHOD_COLOR.card },
                { label: 'Crypto', value: money(data.payoutsByMethod.crypto, 2), color: METHOD_COLOR.crypto },
              ]}
            />
          </div>

          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[2] }}>Recent payouts</div>
          <div style={{ ...card({ pad: 0, radius: 'var(--r-lg)' }), overflow: 'hidden' }}>
            {data.recentPayouts.length === 0 && <div style={{ ...t('meta'), color: 'var(--text-muted)', padding: S[4] }}>No settled payouts yet.</div>}
            {data.recentPayouts.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: `${S[3]}px ${S[4]}px`, borderTop: i ? '1px solid var(--divider)' : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('meta'), color: 'var(--text-strong)' }}>{shortW(p.seller_wallet)}</div>
                  <div style={{ ...t('micro'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {new Date(p.delivered_at).toLocaleDateString()}
                    {p.payout_tx ? ` · ${shortW(p.payout_tx)}` : ''}
                  </div>
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 700 }}>{money(p.seller_net_usd, 2)}</div>
                <span style={{ ...t('micro'), color: METHOD_COLOR[p.payout_method ?? ''] ?? 'var(--text-muted)', textTransform: 'capitalize', minWidth: 54, textAlign: 'right' }}>{p.payout_method ?? '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
