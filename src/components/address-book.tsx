'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, btn, surface, badge, T } from '@/lib/ui';
import { AddressForm, EMPTY_SHIP_TO, shipToValid, shipToSummary, type ShipTo } from '@/components/address-form';

const GREEN = 'var(--ok)';
const RED = 'var(--danger)';

type SavedAddress = ShipTo & { id: string; label: string | null; is_default: boolean };

// Buyer's saved-address book (blueprint 7.4). Purely additive alongside ShipToSettings /
// profiles.ship_to: setting an address as default here also writes it into profiles.ship_to
// (server-side, in /api/buyer/addresses), so checkout keeps reading that single field untouched.
export default function AddressBook({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [draft, setDraft] = useState<ShipTo>(EMPTY_SHIP_TO);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function authHeaders() {
    const token = await getAccessToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }

  async function load() {
    if (!wallet) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/buyer/addresses?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setAddresses(Array.isArray(d.addresses) ? d.addresses : []);
    } catch {
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [wallet]);

  async function addAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!shipToValid(draft)) { setErrMsg('Enter at least street, city, state and ZIP'); setStatus('error'); return; }
    if (addresses.length >= 20) { setErrMsg('You can save up to 20 addresses'); setStatus('error'); return; }
    setStatus('saving'); setErrMsg('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/buyer/addresses', {
        method: 'POST',
        headers,
        body: JSON.stringify({ wallet, address: { label: label.trim() || undefined, ...draft } }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Save failed');
      setStatus('saved');
      setDraft(EMPTY_SHIP_TO);
      setLabel('');
      setAdding(false);
      await load();
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Save failed');
      setStatus('error');
    }
  }

  async function makeDefault(id: string) {
    setBusyId(id);
    try {
      const headers = await authHeaders();
      await fetch('/api/buyer/addresses', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ wallet, id, make_default: true }),
      });
      await load();
    } catch {}
    setBusyId(null);
  }

  async function removeAddress(id: string) {
    setBusyId(id);
    try {
      const headers = await authHeaders();
      await fetch(`/api/buyer/addresses?wallet=${wallet}&id=${id}`, { method: 'DELETE', headers });
      await load();
    } catch {}
    setBusyId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ ...t('meta'), color: T.textMuted }}>
        Save multiple addresses and pick which one checkout uses by default.
      </div>

      {loading ? (
        <div style={{ ...t('meta'), color: T.textMuted }}>Loading…</div>
      ) : addresses.length === 0 && !adding ? (
        <div style={{ ...t('meta'), color: T.textMuted }}>No saved addresses yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {addresses.map(a => (
            <div key={a.id} style={{ ...surface({ radius: 'var(--r-sm)' }), padding: '12px 14px', display: 'flex', alignItems: 'center', gap: S[3] }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                  <span style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>{a.label || 'Address'}</span>
                  {a.is_default && <span style={badge('success')}>Default</span>}
                </div>
                <div style={{ ...t('meta'), color: T.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {shipToSummary(a)}
                </div>
              </div>
              {!a.is_default && (
                <button
                  onClick={() => makeDefault(a.id)}
                  disabled={busyId === a.id}
                  style={{ ...btn('secondary', { pill: false }), padding: '7px 12px', opacity: busyId === a.id ? 0.6 : 1 }}
                >
                  Set default
                </button>
              )}
              <button
                onClick={() => removeAddress(a.id)}
                disabled={busyId === a.id}
                aria-label="Delete address"
                style={{ ...btn('secondary', { pill: false }), padding: '7px 10px', opacity: busyId === a.id ? 0.6 : 1 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <form onSubmit={addAddress} style={{ ...surface({ radius: 'var(--r-sm)' }), padding: '14px', display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            maxLength={60}
            placeholder="Label (e.g. Home, Work)"
            style={{ width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--box-shadow-soft)', padding: '13px 16px', color: 'var(--text)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
          />
          <AddressForm value={draft} onChange={setDraft} />
          {status === 'error' && <div style={{ ...t('meta'), color: RED }}>{errMsg}</div>}
          {status === 'saved' && <div style={{ ...t('meta'), color: GREEN }}>Address saved</div>}
          <div style={{ display: 'flex', gap: S[2] }}>
            <button
              type="button"
              onClick={() => { setAdding(false); setDraft(EMPTY_SHIP_TO); setLabel(''); setStatus('idle'); setErrMsg(''); }}
              style={{ ...btn('secondary', { pill: false }), flex: 1 }}
            >
              Cancel
            </button>
            <button type="submit" disabled={status === 'saving'} style={{ ...btn('primary', { pill: false }), flex: 1, opacity: status === 'saving' ? 0.6 : 1 }}>
              {status === 'saving' ? 'Saving…' : 'Save address'}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...btn('secondary', { full: true }) }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add address
        </button>
      )}
    </div>
  );
}
