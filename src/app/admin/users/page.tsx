'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card, surface, btn, badge, avatar, input } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

type AccountStatus = 'active' | 'suspended' | 'banned';

type User = {
  wallet: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  kyc_status: string | null;
  account_type: string | null;
  is_flagged: boolean;
  account_status: AccountStatus | null;
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

// account_status has no dedicated badge() variant (only default/onImage/success/danger) — suspended
// needs an amber "in-between" read, so it's composed here from the same --warn tokens badge() uses
// for danger/success, matching that shape exactly.
function statusStyle(status: AccountStatus | null): CSSProperties {
  if (status === 'banned') return badge('danger');
  if (status === 'suspended') {
    return { ...badge('default'), background: 'var(--warn-soft)', color: 'var(--warn)', border: '1px solid var(--warn-soft)' };
  }
  return badge('success');
}

function statusLabel(status: AccountStatus | null): string {
  if (status === 'banned') return 'Banned';
  if (status === 'suspended') return 'Suspended';
  return 'Active';
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
      setErr(friendlyError(e, 'Failed to load — try again.'));
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

  // Which row has its reason input open, and the action it's for.
  const [reasonFor, setReasonFor] = useState<{ wallet: string; action: 'suspend_user' | 'ban_user' } | null>(null);
  const [reasonText, setReasonText] = useState('');

  async function runModeration(u: User, action: 'suspend_user' | 'ban_user' | 'reinstate_user', reason?: string) {
    if (busy) return;
    setBusy(u.wallet); setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/moderation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, action, target_id: u.wallet, ...(reason ? { reason } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Could not update'); return; }
      const nextStatus: AccountStatus = action === 'reinstate_user' ? 'active' : action === 'ban_user' ? 'banned' : 'suspended';
      setUsers((prev) => (prev ?? []).map((x) => (x.wallet === u.wallet ? { ...x, account_status: nextStatus } : x)));
      setReasonFor(null);
      setReasonText('');
    } finally {
      setBusy(null);
    }
  }

  function openReasonPrompt(u: User, action: 'suspend_user' | 'ban_user') {
    setErr('');
    setReasonText('');
    setReasonFor({ wallet: u.wallet, action });
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
          {users.map((u, i) => {
            const status: AccountStatus = u.account_status ?? 'active';
            const rowBusy = busy === u.wallet;
            const promptOpen = reasonFor?.wallet === u.wallet;
            return (
              <div key={u.wallet} style={{ display: 'flex', flexDirection: 'column', gap: S[3], padding: `${S[3]}px ${S[4]}px`, borderTop: i ? '1px solid var(--divider)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
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
                      <span style={statusStyle(status)}>{statusLabel(status)}</span>
                    </div>
                  </div>

                  <button onClick={() => toggleFlag(u)} disabled={rowBusy}
                    style={{
                      ...btn(u.is_flagged ? 'secondary' : 'danger', { pill: false }),
                      padding: '8px 14px', fontSize: 13, flexShrink: 0,
                      opacity: rowBusy ? 0.6 : 1,
                    }}>
                    {rowBusy && !promptOpen ? '…' : u.is_flagged ? 'Unflag' : 'Flag'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                  {status !== 'active' && (
                    <button onClick={() => runModeration(u, 'reinstate_user')} disabled={rowBusy}
                      style={{ ...btn('secondary', { pill: false }), padding: '8px 14px', fontSize: 13, opacity: rowBusy ? 0.6 : 1 }}>
                      {rowBusy ? '…' : 'Reinstate'}
                    </button>
                  )}
                  {status !== 'suspended' && status !== 'banned' && (
                    <button onClick={() => openReasonPrompt(u, 'suspend_user')} disabled={rowBusy}
                      style={{ ...btn('secondary', { pill: false }), padding: '8px 14px', fontSize: 13, color: 'var(--warn)', opacity: rowBusy ? 0.6 : 1 }}>
                      Suspend
                    </button>
                  )}
                  {status !== 'banned' && (
                    <button onClick={() => openReasonPrompt(u, 'ban_user')} disabled={rowBusy}
                      style={{ ...btn('danger', { pill: false }), padding: '8px 14px', fontSize: 13, opacity: rowBusy ? 0.6 : 1 }}>
                      Ban
                    </button>
                  )}
                </div>

                {promptOpen && (
                  <div style={{ ...surface({ pad: S[3], radius: 'var(--r-sm)' }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
                    <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                      {reasonFor?.action === 'ban_user' ? 'Reason for ban (optional)' : 'Reason for suspension (optional)'}
                    </div>
                    <input
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      placeholder="Shown to the user"
                      autoFocus
                      style={{ ...input() }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && reasonFor) runModeration(u, reasonFor.action, reasonText.trim() || undefined); }}
                    />
                    <div style={{ display: 'flex', gap: S[2] }}>
                      <button
                        onClick={() => reasonFor && runModeration(u, reasonFor.action, reasonText.trim() || undefined)}
                        disabled={rowBusy}
                        style={{ ...btn(reasonFor?.action === 'ban_user' ? 'danger' : 'primary', { pill: false }), padding: '8px 14px', fontSize: 13, opacity: rowBusy ? 0.6 : 1 }}>
                        {rowBusy ? 'Working…' : reasonFor?.action === 'ban_user' ? 'Confirm ban' : 'Confirm suspend'}
                      </button>
                      <button onClick={() => { setReasonFor(null); setReasonText(''); }} disabled={rowBusy}
                        style={{ ...btn('text'), padding: '8px 14px', fontSize: 13 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
