'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, surface, btn, badge, sectionLabel, T } from '@/lib/ui';

type Verification = {
  id: string;
  wallet: string;
  account_type: 'personal' | 'business' | null;
  provider: string | null;
  inquiry_id: string | null;
  template_id: string | null;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

const short = (w: string) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w);

const GREEN = '#00C48C';
const RED = '#FF3B5C';

function statusStyle(status: string) {
  const s = status.toLowerCase();
  if (s === 'approved' || s === 'completed' || s === 'passed') return { ...badge('success') };
  if (s === 'declined' || s === 'failed' || s === 'rejected') return { ...badge('danger') };
  return { ...badge('default') };
}

export default function AdminKycPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'forbidden' | 'ready'>('loading');
  const [rows, setRows] = useState<Verification[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { if (ready && wallet) getAccessToken().then(tk => setToken(tk ?? null)); }, [ready, wallet, getAccessToken]);

  const load = useCallback(async () => {
    if (!wallet || !token) return;
    const res = await fetch(`/api/admin/kyc?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setState('forbidden'); return; }
    const j = await res.json();
    setRows(Array.isArray(j.verifications) ? j.verifications : []);
    setState('ready');
  }, [wallet, token]);
  useEffect(() => { load(); }, [load]);

  async function override(target_wallet: string, status: 'approved' | 'declined') {
    if (busy) return;
    setBusy(target_wallet + status); setErr('');
    try {
      const res = await fetch('/api/admin/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, target_wallet, status }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? 'Could not update'); return; }
      await load();
    } finally { setBusy(null); }
  }

  if (state === 'forbidden') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[3], padding: S[5] }}>
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <p style={{ ...t('heading'), color: T.textMuted, margin: 0 }}>Not authorized</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: S[8] }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--glass-border)', padding: `${S[4]}px ${S[4]}px ${S[3]}px`, display: 'flex', alignItems: 'center', gap: S[2] }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
        <h1 style={{ ...t('title'), color: T.textStrong, margin: 0 }}>ID verification</h1>
        <div style={{ display: 'flex', gap: S[2], marginLeft: 'auto', alignItems: 'center' }}>
          <Link href="/admin/team" style={{ ...btn('text'), fontSize: 13 }}>Team</Link>
          <HeaderMenu />
        </div>
      </div>

      <div style={{ padding: `${S[4]}px ${S[4]}px`, display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <span style={{ ...sectionLabel(), display: 'block' }}>Verifications ({rows.length})</span>

        {rows.length === 0 && state === 'ready' && (
          <div style={{ ...t('meta'), color: T.textMuted }}>No verifications yet.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {rows.map(r => (
            <div key={r.id} style={{ ...surface({ radius: 'var(--r-sm)', pad: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('body'), color: T.textStrong, fontFamily: 'monospace' }}>{short(r.wallet)}</div>
                  <div style={{ display: 'flex', gap: S[2], alignItems: 'center', marginTop: S[1], flexWrap: 'wrap' }}>
                    <span style={statusStyle(r.status)}>{r.status}</span>
                    {r.account_type && <span style={{ ...t('micro'), color: T.textMuted }}>{r.account_type}</span>}
                    {r.provider && <span style={{ ...t('micro'), color: T.textMuted }}>{r.provider}</span>}
                    <span style={{ ...t('micro'), color: T.textMuted, textTransform: 'none', letterSpacing: 0 }}>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: S[2] }}>
                <button onClick={() => override(r.wallet, 'approved')} disabled={!!busy}
                  style={{ ...btn('secondary', { pill: false }), flex: 1, padding: '8px', fontSize: 13, color: GREEN, opacity: busy ? 0.6 : 1 }}>
                  {busy === r.wallet + 'approved' ? '…' : 'Approve'}
                </button>
                <button onClick={() => override(r.wallet, 'declined')} disabled={!!busy}
                  style={{ ...btn('danger', { pill: false }), flex: 1, padding: '8px', fontSize: 13, opacity: busy ? 0.6 : 1 }}>
                  {busy === r.wallet + 'declined' ? '…' : 'Decline'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {err && <span style={{ ...t('meta'), color: RED }}>{err}</span>}
      </div>
    </div>
  );
}
