'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, btn, sectionLabel, input } from '@/lib/ui';

const GREEN = 'var(--ok)';
const RED   = 'var(--danger)';

type ShipFrom = {
  name: string; street1: string; street2: string;
  city: string; state: string; zip: string; country: string; phone: string;
};
const EMPTY: ShipFrom = { name: '', street1: '', street2: '', city: '', state: '', zip: '', country: 'US', phone: '' };

// The seller's ship-from (return) address. Required before automatic carrier labels can be
// purchased at fulfillment — the rate-shop and label are calculated from here to the buyer.
export default function ShipFromSettings({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const [v, setV] = useState<ShipFrom>(EMPTY);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!wallet) return;
    (async () => {
      const token = await getAccessToken();
      return fetch(`/api/seller/ship-from?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
    })()
      .then(r => r.json())
      .then(d => { if (d.ship_from) setV({ ...EMPTY, ...d.ship_from }); })
      .catch(() => {});
  }, [wallet]);

  function set<K extends keyof ShipFrom>(k: K, val: string) { setV(prev => ({ ...prev, [k]: val })); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving'); setErrMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/seller/ship-from', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ seller_wallet: wallet, ship_from: v }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Save failed');
      setStatus('error');
    }
  }

  const cell = { ...input(), boxSizing: 'border-box' as const };

  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div>
        <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Ship-from address</div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
          Your return address. We rate-shop carriers from here to the buyer and buy the label automatically when you fulfill an order.
        </div>
      </div>

      <input value={v.name} onChange={e => set('name', e.target.value)} placeholder="Name (optional)" style={cell} />
      <input value={v.street1} onChange={e => set('street1', e.target.value)} placeholder="Street address" required style={cell} />
      <input value={v.street2} onChange={e => set('street2', e.target.value)} placeholder="Apt, suite (optional)" style={cell} />
      <div style={{ display: 'flex', gap: S[2] }}>
        <input value={v.city} onChange={e => set('city', e.target.value)} placeholder="City" required style={{ ...cell, flex: 2 }} />
        <input value={v.state} onChange={e => set('state', e.target.value)} placeholder="State" required style={{ ...cell, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: S[2] }}>
        <input value={v.zip} onChange={e => set('zip', e.target.value)} inputMode="numeric" placeholder="ZIP" required style={{ ...cell, flex: 1 }} />
        <input value={v.country} onChange={e => set('country', e.target.value)} placeholder="Country" required style={{ ...cell, flex: 1 }} />
      </div>
      <input value={v.phone} onChange={e => set('phone', e.target.value)} inputMode="tel" placeholder="Phone (optional)" style={cell} />

      {status === 'error' && <div style={{ ...t('meta'), color: RED }}>{errMsg}</div>}
      {status === 'saved' && <div style={{ ...t('meta'), color: GREEN }}>Ship-from address saved</div>}

      <button type="submit" disabled={status === 'saving'} style={{ ...btn('primary', { full: true }), opacity: status === 'saving' ? 0.6 : 1 }}>
        {status === 'saving' ? 'Saving…' : 'Save ship-from address'}
      </button>
    </form>
  );
}
