'use client';

import { useCallback, useEffect, useState } from 'react';
import { t, S, card, surface, sheet, btn, badge, input, T } from '@/lib/ui';

const GREEN = 'var(--ok)';
const RED = 'var(--danger)';

const KINDS = [
  { value: 'not_received',      label: 'Item not received' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'damaged',          label: 'Arrived damaged' },
  { value: 'counterfeit',      label: 'Suspected counterfeit' },
  { value: 'return',           label: 'I want to return it' },
  { value: 'other',            label: 'Other' },
] as const;

type Kind = (typeof KINDS)[number]['value'];

function kindLabel(kind: string): string {
  return KINDS.find(k => k.value === kind)?.label ?? 'Issue reported';
}

interface Dispute {
  id: string;
  order_id: string;
  kind: string;
  reason?: string | null;
  status: 'open' | 'under_review' | 'refunded' | 'denied' | 'closed';
}

const FlagIcon = ({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
    <line x1="4" y1="22" x2="4" y2="15"/>
  </svg>
);

export function DisputePanel({
  orderId,
  buyerWallet,
  status,
  payoutReleased,
  getAccessToken,
  onChange,
}: {
  orderId: string;
  buyerWallet: string;
  status: string;
  payoutReleased: boolean;
  getAccessToken: () => Promise<string | null>;
  onChange?: () => void;
}) {
  const [dispute, setDispute] = useState<Dispute | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(KINDS[0].value);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const fetchDispute = useCallback(async () => {
    if (!buyerWallet || !orderId) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/disputes?wallet=${buyerWallet}&role=buyer`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const found: Dispute | undefined = (data.disputes ?? []).find(
        (d: Dispute) => d.order_id === orderId,
      );
      setDispute(found);
    } catch {
      // tolerate missing table / network errors — panel simply offers to report
    }
  }, [buyerWallet, orderId, getAccessToken]);

  useEffect(() => {
    fetchDispute();
  }, [fetchDispute]);

  function openSheet() {
    setErr('');
    setKind(KINDS[0].value);
    setReason('');
    setOpen(true);
  }

  async function submit() {
    if (busy) return;
    if (!reason.trim()) { setErr('Please add a few details so we can help.'); return; }
    setBusy(true);
    setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          buyer_wallet: buyerWallet,
          order_id: orderId,
          kind,
          reason: reason.trim().slice(0, 2000),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? 'Failed to submit. Please try again.');
      }
      setOpen(false);
      await fetchDispute();
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (busy || !dispute) return;
    setBusy(true);
    setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/disputes', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ buyer_wallet: buyerWallet, dispute_id: dispute.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? 'Failed to withdraw. Please try again.');
      }
      await fetchDispute();
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const eligible =
    !dispute && !payoutReleased && status !== 'cancelled' && status !== 'refunded';

  if (dispute && (dispute.status === 'open' || dispute.status === 'under_review')) {
    return (
      <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
          <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
            <FlagIcon size={15} color="var(--text-muted)" />
          </span>
          <span style={badge('default')}>
            {dispute.status === 'under_review'
              ? 'Problem reported — under review'
              : 'Problem reported — open'}
          </span>
        </div>

        <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>{kindLabel(dispute.kind)}</span>
          {dispute.reason && (
            <span style={{ ...t('body'), color: 'var(--text)' }}>{dispute.reason}</span>
          )}
        </div>

        {err && <div style={{ ...t('meta'), color: RED }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={withdraw}
            disabled={busy}
            style={{ ...btn('text'), opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            {busy ? 'Withdrawing…' : 'Withdraw'}
          </button>
        </div>
      </div>
    );
  }

  if (dispute && dispute.status === 'refunded') {
    return (
      <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
          <span style={badge('success')}>Refunded</span>
        </div>
        <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <span style={{ ...t('heading'), color: GREEN }}>Your money was returned</span>
          <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{kindLabel(dispute.kind)}</span>
        </div>
      </div>
    );
  }

  if (dispute && (dispute.status === 'denied' || dispute.status === 'closed')) {
    return (
      <div style={{ ...card(), padding: S[4] }}>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Dispute closed</div>
      </div>
    );
  }

  if (!eligible) return null;

  return (
    <>
      <div style={{ ...card(), padding: S[4], display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
        <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Something wrong with this order?</span>
        <button
          onClick={openSheet}
          style={{ ...btn('secondary'), padding: `${S[2]}px ${S[4]}px` }}
        >
          <FlagIcon size={14} color="var(--text-muted)" />
          Report a problem
        </button>
      </div>

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
              <span style={{ ...t('heading'), color: T.textStrong }}>Report a problem</span>
              <button onClick={() => setOpen(false)} style={{ ...btn('text'), padding: S[1] }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              <label style={{ ...t('meta'), color: T.textMuted }}>What happened?</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                style={{ ...input(), appearance: 'none', WebkitAppearance: 'none' }}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              <label style={{ ...t('meta'), color: T.textMuted }}>Tell us what happened</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="Share any details that help us resolve this…"
                style={{ ...input(), boxSizing: 'border-box', resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
              />
              <span style={{ ...t('micro'), color: T.textMuted, textAlign: 'right' }}>
                {reason.length}/2000
              </span>
            </div>

            {err && <span style={{ ...t('meta'), color: RED }}>{err}</span>}

            <button
              onClick={submit}
              disabled={busy}
              style={{ ...btn('primary', { full: true }), opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
            >
              {busy ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
