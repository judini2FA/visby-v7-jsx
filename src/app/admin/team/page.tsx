'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, card, surface, btn, badge, sectionLabel, input, T } from '@/lib/ui';
import type { AdminRole } from '@/lib/admin';

type AdminUser = { wallet: string; role: AdminRole; granted_by: string | null; granted_at: string; bootstrap?: boolean };

const short = (w: string) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w);

export default function AdminTeamPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'forbidden' | 'ready'>('loading');
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [target, setTarget] = useState('');
  const [role, setRole] = useState<AdminRole>('moderator');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (ready && wallet) getAccessToken().then(t => setToken(t ?? null)); }, [ready, wallet, getAccessToken]);

  const load = useCallback(async () => {
    if (!wallet || !token) return;
    const res = await fetch(`/api/admin/team?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403) { setState('forbidden'); return; }
    if (!res.ok) { setState('forbidden'); return; }
    const j = await res.json();
    setAdmins(Array.isArray(j.admins) ? j.admins : []);
    setRoles(Array.isArray(j.roles) ? j.roles : []);
    setState('ready');
  }, [wallet, token]);
  useEffect(() => { load(); }, [load]);

  async function grant() {
    if (!target.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, target_wallet: target.trim(), role }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? 'Could not grant'); return; }
      setTarget('');
      await load();
    } finally { setBusy(false); }
  }

  async function revoke(target_wallet: string) {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/admin/team', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, target_wallet }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error ?? 'Could not revoke');
      await load();
    } finally { setBusy(false); }
  }

  if (state === 'forbidden') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[3], padding: S[5] }}>
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <p style={{ ...t('heading'), color: T.textMuted, margin: 0 }}>Super-admins only</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: S[8] }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--glass-border)', padding: `${S[4]}px ${S[4]}px ${S[3]}px`, display: 'flex', alignItems: 'center', gap: S[2] }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <h1 style={{ ...t('title'), color: T.textStrong, margin: 0 }}>Admin team</h1>
        <div style={{ display: 'flex', gap: S[2], marginLeft: 'auto', alignItems: 'center' }}>
          <Link href="/admin/reports" style={{ ...btn('text'), fontSize: 13 }}>Reports</Link>
          <HeaderMenu />
        </div>
      </div>

      <div style={{ padding: `${S[4]}px ${S[4]}px`, display: 'flex', flexDirection: 'column', gap: S[4] }}>
        {/* Grant */}
        <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <span style={sectionLabel()}>Grant admin access</span>
          <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Wallet address" style={{ ...input() }} />
          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            {roles.map(r => (
              <button key={r} onClick={() => setRole(r)} style={{ ...(role === r ? btn('primary') : btn('secondary')), fontSize: 12, padding: '7px 12px', textTransform: 'capitalize' }}>{r.replace('_', ' ')}</button>
            ))}
          </div>
          {err && <span style={{ ...t('meta'), color: 'var(--danger)' }}>{err}</span>}
          <button onClick={grant} disabled={!target.trim() || busy} style={{ ...btn('primary', { full: true }), opacity: !target.trim() || busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : 'Grant access'}
          </button>
        </div>

        {/* Roster */}
        <div>
          <span style={{ ...sectionLabel(), display: 'block', marginBottom: S[2] }}>Current admins ({admins.length})</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {admins.map(a => (
              <div key={a.wallet} style={{ ...surface({ radius: 'var(--r-sm)', pad: '12px 14px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('body'), color: T.textStrong, fontFamily: 'monospace' }}>{short(a.wallet)}</div>
                  <div style={{ display: 'flex', gap: S[2], alignItems: 'center', marginTop: 2 }}>
                    <span style={{ ...badge('default'), textTransform: 'capitalize' }}>{a.role.replace('_', ' ')}</span>
                    {a.bootstrap && <span style={{ ...t('micro'), color: T.textMuted }}>bootstrap (env)</span>}
                  </div>
                </div>
                {!a.bootstrap && (
                  <button onClick={() => revoke(a.wallet)} disabled={busy} style={{ ...btn('text'), fontSize: 13, color: 'var(--danger)' }}>Revoke</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
