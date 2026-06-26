'use client';

import { useState } from 'react';
import { btn, sheet, input, S, t, T } from '@/lib/ui';

const REASONS: Record<'listing' | 'seller' | 'message', readonly string[]> = {
  listing: ['Counterfeit', 'Prohibited item', 'Not as described', 'Spam or scam', 'Inappropriate', 'Other'],
  seller:  ['Suspected scam or fraud', 'Sells counterfeits', 'Harassment or abuse', 'Impersonation', 'Inappropriate', 'Other'],
  message: ['Spam', 'Harassment or abuse', 'Scam attempt', 'Inappropriate', 'Other'],
};

export function ReportButton({
  targetType,
  targetId,
  reporterWallet,
  getAccessToken,
  label,
  compact = false,
}: {
  targetType: 'listing' | 'seller' | 'message';
  targetId: string;
  reporterWallet?: string;
  getAccessToken: () => Promise<string | null>;
  label?: string;
  compact?: boolean;
}) {
  const reasons = REASONS[targetType];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(reasons[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  function openSheet() {
    if (!reporterWallet) return;
    setDone(false);
    setErr('');
    setReason(reasons[0]);
    setDetails('');
    setOpen(true);
  }

  async function submit() {
    if (busy || !reporterWallet) return;
    setBusy(true);
    setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reporter_wallet: reporterWallet,
          target_type: targetType,
          target_id: targetId,
          reason,
          details: details.slice(0, 2000) || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? 'Failed to submit report');
      }
      setDone(true);
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const triggerStyle = compact
    ? { ...btn('text'), padding: `${S[1]}px ${S[2]}px`, color: 'var(--text-muted)' }
    : btn('text');

  return (
    <>
      <button
        onClick={openSheet}
        disabled={!reporterWallet}
        title={reporterWallet ? 'Report' : 'Sign in to report'}
        style={{ ...triggerStyle, opacity: reporterWallet ? 1 : 0.45 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
        {label ?? (compact ? '' : 'Report')}
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            background: 'var(--img-scrim)',
          }}
        >
          <div
            style={{
              ...sheet(),
              width: '100%', maxWidth: 480,
              padding: S[5],
              display: 'flex', flexDirection: 'column', gap: S[4],
              borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...t('heading'), color: T.textStrong }}>Report</span>
              <button
                onClick={() => setOpen(false)}
                style={{ ...btn('text'), padding: S[1] }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {done ? (
              <div style={{ ...t('body'), color: T.text, padding: `${S[4]}px 0`, textAlign: 'center' }}>
                Reported — our team will review.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <label style={{ ...t('meta'), color: T.textMuted }}>Reason</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ ...input(), appearance: 'none', WebkitAppearance: 'none' }}
                  >
                    {reasons.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <label style={{ ...t('meta'), color: T.textMuted }}>Details (optional)</label>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
                    rows={4}
                    placeholder="Describe the issue..."
                    style={{ ...input(), resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
                  />
                  <span style={{ ...t('micro'), color: T.textMuted, textAlign: 'right' }}>
                    {details.length}/2000
                  </span>
                </div>

                {err && (
                  <span style={{ ...t('meta'), color: 'var(--danger)' }}>{err}</span>
                )}

                <button
                  onClick={submit}
                  disabled={busy}
                  style={{ ...btn('primary', { full: true }), opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? 'Submitting...' : 'Submit Report'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
