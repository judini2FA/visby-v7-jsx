'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card, surface, btn, badge, avatar, input } from '@/lib/ui';

type User = {
  wallet: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  kyc_status: string | null;
  account_type: string | null;
  is_flagged: boolean;
  created_at: string | null;
};

const shortW = (w: string) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w || '—');
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const initials = (u: User) => ((u.display_name || u.wallet || '?').trim().charAt(0) || '?').toUpperCase();

function kycStyle(status: string | null) {
  const s = (status || '').toLowerCase();
  if (s === 'approved' || s === 'completed' || s === 'passed') return badge('success');
  if (s === 'declined' || s === 'failed' || s === 'rejected') return badge('danger');
  return badge('default');
}

export default function AdminUsersPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');
  const [users, setUsers] = useState<User[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!ready || !wallet) return;
    setErr('');
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ wallet, filter });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/admin/users?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setUsers(Array.isArray(d.users) ? d.users : []);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load');
      setUsers([]);
    }
  }, [ready, wallet, getAccessToken, filter, q]);

  useEffect(() => {
    if (!ready || !wallet) return;
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load, ready, wallet]);

  async function toggleFlag(u: User) {
    if (busy) return;
    setBusy(u.wallet); setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, target_wallet: u.wallet, is_flagged: !u.is_flagged }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Could not update'); return; }
      setUsers((prev) => (prev ?? []).map((x) => (x.wallet === u.wallet ? { ...x, is_flagged: !u.is_flagged } : x)));
    } finally {
      setBusy(null);
    }
  }

  const tabs: { key: 'all' | 'flagged'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'flagged', label: 'Flagged' },
  ];

  return (
    <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 120 }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[4] }}>Users</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3], marginBottom: S[5] }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search wallet or name…"
          style={{ ...input() }}
        />
        <div style={{ display: 'flex', gap: S[2] }}>
          {tabs.map((tb) => {
            const active = filter === tb.key;
            return (
              <button key={tb.key} onClick={() => setFilter(tb.key)}
                style={{
                  ...btn(active ? 'primary' : 'secondary', { pill: true }),
                  padding: '8px 16px', fontSize: 13,
                }}>
                {tb.label}
              </button>
            );
          })}
        </div>
      </div>

      {err && <div style={{ ...surface({ pad: S[4] }), color: 'var(--danger)', marginBottom: S[4] }}>{err}</div>}
      {users === null && !err && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Loading…</div>}
      {users !== null && users.length === 0 && !err && (
        <div style={{ ...surface({ pad: S[4], radius: 'var(--r-lg)' }), ...t('meta'), color: 'var(--text-muted)' }}>
          {filter === 'flagged' ? 'No flagged users.' : q.trim() ? 'No users match that search.' : 'No users yet.'}
        </div>
      )}

      {users && users.length > 0 && (
        <div style={{ ...card({ pad: 0, radius: 'var(--r-lg)' }), overflow: 'hidden' }}>
          {users.map((u, i) => (
            <div key={u.wallet} style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: `${S[3]}px ${S[4]}px`, borderTop: i ? '1px solid var(--divider)' : undefined }}>
              <div style={{ ...avatar('md'), background: 'var(--grad-brand)' }}>
                {u.avatar_url
                  ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials(u)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.display_name || shortW(u.wallet)}
                </div>
                <div style={{ ...t('micro'), color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontFamily: 'monospace' }}>{shortW(u.wallet)}</div>
                <div style={{ display: 'flex', gap: S[1], marginTop: S[1], flexWrap: 'wrap' }}>
                  <span style={kycStyle(u.kyc_status)}>{cap(u.kyc_status || 'unverified')}</span>
                  {u.account_type && u.account_type !== 'personal' && <span style={badge('default')}>{cap(u.account_type)}</span>}
                  {u.is_flagged && <span style={badge('danger')}>Flagged</span>}
                </div>
              </div>

              <button onClick={() => toggleFlag(u)} disabled={busy === u.wallet}
                style={{
                  ...btn(u.is_flagged ? 'secondary' : 'danger', { pill: false }),
                  padding: '8px 14px', fontSize: 13, flexShrink: 0,
                  opacity: busy === u.wallet ? 0.6 : 1,
                }}>
                {busy === u.wallet ? '…' : u.is_flagged ? 'Unflag' : 'Flag'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
