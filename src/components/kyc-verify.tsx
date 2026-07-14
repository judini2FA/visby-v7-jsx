'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, card, btn, badge, T } from '@/lib/ui';

type KycStatus = 'unverified' | 'pending' | 'approved' | 'declined' | 'review';

type StatusResponse = {
  kyc_status: KycStatus;
  kyc_verified_at: string | null;
  required: boolean;
};

const GREEN = '#00C48C';
const RED = '#FF3B5C';

const ShieldCheck = ({ size = 16, color = GREEN }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

export default function KycVerify() {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [opened, setOpened] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/kyc/status', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const j: StatusResponse = await res.json();
      setData(j);
    } catch { /* non-fatal */ }
  }, [getAccessToken]);
  useEffect(() => { load(); }, [load]);

  async function start() {
    if (starting) return;
    setStarting(true); setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 503) { setErr("Verification isn't available yet."); return; }
      if (!res.ok || !j.url) { setErr(j.error ?? 'Could not start verification — try again.'); return; }
      window.open(j.url, '_blank');
      setOpened(true);
      await load();
    } finally { setStarting(false); }
  }

  if (!data) return null;
  if (data.required === false) return null;

  if (data.kyc_status === 'approved') {
    return (
      <div style={{ ...card({ pad: '14px 16px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
        <ShieldCheck size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...t('body'), fontWeight: 700, color: T.textStrong }}>Identity verified</div>
          {data.kyc_verified_at && (
            <div style={{ ...t('meta'), color: T.textMuted, marginTop: 1 }}>
              Verified {new Date(data.kyc_verified_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    );
  }

  const status = data.kyc_status;
  const declined = status === 'declined';

  const statusPill =
    status === 'pending' ? { text: 'Verification in progress', color: T.textMuted, variant: 'default' as const } :
    status === 'review'  ? { text: 'Under review', color: T.textMuted, variant: 'default' as const } :
    declined             ? { text: "Verification didn't pass — try again", color: RED, variant: 'danger' as const } :
    null;

  return (
    <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <ShieldCheck size={18} color="var(--text-strong)" />
        <div style={{ ...t('heading'), color: T.textStrong }}>Verify your identity to sell</div>
      </div>
      <div style={{ ...t('meta'), color: T.textMuted, lineHeight: 1.5 }}>
        A one-time ID check keeps Visby trusted. Buying stays open — this is only needed to list items.
        Selling as a business? Verify your business separately in Settings.
      </div>

      {statusPill && (
        <span style={{ ...badge(statusPill.variant), color: statusPill.color, alignSelf: 'flex-start', letterSpacing: 0, textTransform: 'none' }}>
          {statusPill.text}
        </span>
      )}

      {opened && (
        <div style={{ ...t('meta'), color: T.textMuted, lineHeight: 1.5 }}>
          Opened in a new tab — complete the check, then come back.
        </div>
      )}

      {err && <div style={{ ...t('meta'), color: RED, lineHeight: 1.5 }}>{err}</div>}

      <button type="button" onClick={start} disabled={starting}
        style={{ ...btn('primary', { full: true }), opacity: starting ? 0.7 : 1, cursor: starting ? 'not-allowed' : 'pointer' }}>
        {starting ? 'Starting…' : declined ? 'Re-verify' : 'Verify identity'}
      </button>
    </div>
  );
}
