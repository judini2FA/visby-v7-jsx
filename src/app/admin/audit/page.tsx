'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, surface, btn, badge, T } from '@/lib/ui';

type AuditEvent = {
  id: string;
  wallet: string;
  event: string;
  detail: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

const short = (w: string) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w);

const summarize = (detail: Record<string, unknown> | null) => {
  if (!detail) return '';
  const s = JSON.stringify(detail);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export default function AdminAuditPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'forbidden' | 'ready'>('loading');
  const [events, setEvents] = useState<AuditEvent[]>([]);

  useEffect(() => { if (ready && wallet) getAccessToken().then(tok => setToken(tok ?? null)); }, [ready, wallet, getAccessToken]);

  const load = useCallback(async () => {
    if (!wallet || !token) return;
    const res = await fetch(`/api/admin/audit?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setState('forbidden'); return; }
    const j = await res.json();
    setEvents(Array.isArray(j.events) ? j.events : []);
    setState('ready');
  }, [wallet, token]);
  useEffect(() => { load(); }, [load]);

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
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <h1 style={{ ...t('title'), color: T.textStrong, margin: 0 }}>Audit log</h1>
        <div style={{ display: 'flex', gap: S[2], marginLeft: 'auto', alignItems: 'center' }}>
          <Link href="/admin/team" style={{ ...btn('text'), fontSize: 13 }}>Team</Link>
          <HeaderMenu />
        </div>
      </div>

      <div style={{ padding: `${S[4]}px ${S[4]}px`, display: 'flex', flexDirection: 'column', gap: S[2] }}>
        {events.length === 0 ? (
          <p style={{ ...t('meta'), color: T.textMuted, margin: 0 }}>No events yet.</p>
        ) : (
          events.map(e => (
            <div key={e.id} style={{ ...surface({ radius: 'var(--r-sm)', pad: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                <span style={badge('default')}>{e.event}</span>
                <span style={{ ...t('meta'), color: T.textMuted, fontFamily: 'monospace' }}>{short(e.wallet)}</span>
                <span style={{ ...t('micro'), color: T.textMuted, marginLeft: 'auto' }}>{when(e.created_at)}</span>
              </div>
              {e.detail && <span style={{ ...t('micro'), color: T.textMuted, fontFamily: 'monospace', wordBreak: 'break-all' }}>{summarize(e.detail)}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
