'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, btn } from '@/lib/ui';
import { AddressForm, EMPTY_SHIP_TO, shipToValid, type ShipTo } from '@/components/address-form';

const GREEN = 'var(--ok)';
const RED   = 'var(--danger)';

// Buyer's default shipping address, saved to profiles.ship_to and snapshotted onto each order at
// purchase — so checkout uses it automatically instead of asking on a separate page.
export default function ShipToSettings({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const [v, setV] = useState<ShipTo>(EMPTY_SHIP_TO);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!wallet) return;
    (async () => {
      const token = await getAccessToken();
      return fetch(`/api/buyer/ship-to?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
    })()
      .then(r => r.json())
      .then(d => { if (d.ship_to) setV({ ...EMPTY_SHIP_TO, ...d.ship_to }); })
      .catch(() => {});
  }, [wallet]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!shipToValid(v)) { setErrMsg('Enter at least street, city, state and ZIP'); setStatus('error'); return; }
    setStatus('saving'); setErrMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/buyer/ship-to', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ buyer_wallet: wallet, ship_to: v }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Save failed');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Save failed');
      setStatus('error');
    }
  }

  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
        Used automatically at checkout so you don&apos;t re-enter it each time.
      </div>
      <AddressForm value={v} onChange={setV} />
      {status === 'error' && <div style={{ ...t('meta'), color: RED }}>{errMsg}</div>}
      {status === 'saved' && <div style={{ ...t('meta'), color: GREEN }}>Shipping address saved</div>}
      <button type="submit" disabled={status === 'saving'} style={{ ...btn('primary', { full: true }), opacity: status === 'saving' ? 0.6 : 1 }}>
        {status === 'saving' ? 'Saving…' : 'Save shipping address'}
      </button>
    </form>
  );
}
