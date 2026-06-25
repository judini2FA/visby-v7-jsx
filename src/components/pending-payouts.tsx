'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, card, surface, btn, sectionLabel } from '@/lib/ui';

const RED = 'var(--danger)';

type PendingOrder = { id: string; item_id: string | null; price_usdc: number | null; created_at: string };

// Delivered orders whose payout failed (stuck in escrow). Renders nothing when there are none, so it only
// appears when the seller actually has money to recover. "Retry payout" hits the atomic /api/orders/retry-payout.
export default function PendingPayouts({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const [orders, setOrders] = useState<PendingOrder[] | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!wallet) { setOrders([]); return; }
    try {
      const token = await getAccessToken();
      const r = await fetch(`/api/orders/pending-payouts?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setOrders(r.ok ? (d.orders ?? []) : []);
    } catch { setOrders([]); }
  }, [wallet, getAccessToken]);

  useEffect(() => { load(); }, [load]);

  async function retry(id: string) {
    setBusy(id); setErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/orders/retry-payout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: id, wallet }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? 'Retry failed');
      setOrders(o => (o ?? []).filter(x => x.id !== id)); // paid → drop from the list
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Retry failed');
    } finally { setBusy(''); }
  }

  if (!orders || orders.length === 0) return null;

  return (
    <div style={{ ...card({ pad: S[5] }), marginTop: S[5], display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div>
        <div style={{ ...sectionLabel() }}>Payouts to retry</div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>
          These delivered orders are awaiting payout — release the funds to your wallet.
        </div>
      </div>
      {err && <div style={{ ...t('meta'), color: RED }}>{err}</div>}
      {orders.map(o => (
        <div key={o.id} style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>${Number(o.price_usdc ?? 0).toFixed(2)}</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Delivered · awaiting payout</div>
          </div>
          <button onClick={() => retry(o.id)} disabled={busy === o.id} style={{ ...btn('primary'), opacity: busy === o.id ? 0.7 : 1, flexShrink: 0 }}>
            {busy === o.id ? 'Retrying…' : 'Retry payout'}
          </button>
        </div>
      ))}
    </div>
  );
}
