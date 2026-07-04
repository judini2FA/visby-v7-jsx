'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { useAdminRole } from '@/lib/use-admin-role';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, card, surface, btn, badge, sectionLabel, tabSlider, price, T } from '@/lib/ui';

const C = {
  green: 'var(--ok)',
  red: 'var(--danger)',
  amber: 'var(--warn)',
  aqua: '#25CDB8',
};

type DisputeStatus = 'open' | 'under_review' | 'refunded' | 'denied' | 'closed';
type DisputeKind = 'not_received' | 'not_as_described' | 'damaged' | 'counterfeit' | 'return' | 'other';

interface Dispute {
  id: string;
  order_id: string;
  item_id: string | null;
  buyer_wallet: string;
  seller_wallet: string;
  kind: DisputeKind;
  reason: string | null;
  status: DisputeStatus;
  resolution_note: string | null;
  refund_amount_usd: number | string | null;
  refund_tx: string | null;
  created_at: string;
}

interface Evidence {
  id: string;
  uploaded_by: string;
  role: 'buyer' | 'seller' | 'admin';
  file_url: string;
  file_type: string | null;
  note: string | null;
  created_at: string;
}

interface ProofOfDelivery {
  carrier: string | null;
  tracking_number: string | null;
  delivered: boolean;
  shipped_at: string | null;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function shortWallet(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

const KIND_LABEL: Record<DisputeKind, string> = {
  not_received: 'Not received',
  not_as_described: 'Not as described',
  damaged: 'Damaged',
  counterfeit: 'Counterfeit',
  return: 'Return',
  other: 'Other',
};

const PaperclipIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
);

const TruckIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13"/>
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
    <circle cx="5.5" cy="18.5" r="2.5"/>
    <circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);

function isImageType(fileType: string | null): boolean {
  return !!fileType && fileType.startsWith('image/');
}

function roleLabel(role: Evidence['role']): string {
  if (role === 'buyer') return 'Buyer';
  if (role === 'seller') return 'Seller';
  return 'Support';
}

// ──────────────────────────────────────────────────────────────
// Evidence viewer — lazy-fetched per dispute card
// ──────────────────────────────────────────────────────────────
function EvidenceViewer({
  disputeId,
  wallet,
  token,
}: {
  disputeId: string;
  wallet: string;
  token: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [proof, setProof] = useState<ProofOfDelivery | null>(null);

  async function fetchEvidence() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/disputes/evidence?dispute_id=${disputeId}&wallet=${encodeURIComponent(wallet)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      setEvidence(Array.isArray(data.evidence) ? data.evidence : []);
      setProof(data.proof_of_delivery ?? null);
      setLoaded(true);
    } catch {
      setEvidence([]);
      setProof(null);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) fetchEvidence();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <button
        style={{ ...btn('text'), fontSize: 13, color: T.textMuted, alignSelf: 'flex-start', padding: '6px 0' }}
        onClick={toggle}
      >
        <PaperclipIcon size={13} color="currentColor" />
        {expanded ? 'Hide evidence' : 'View evidence'}
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {loading && (
            <span style={{ ...t('meta'), color: T.textMuted }}>Loading evidence…</span>
          )}

          {!loading && proof && (proof.carrier || proof.tracking_number || proof.delivered) && (
            <div style={{ ...surface({ pad: S[2], radius: 'var(--r-sm)' }), display: 'flex', alignItems: 'center', gap: S[2] }}>
              <TruckIcon size={13} color={T.textMuted} />
              <span style={{ ...t('meta'), color: T.text }}>
                {proof.carrier ? `${proof.carrier} ` : ''}
                {proof.tracking_number ? `#${proof.tracking_number} — ` : ''}
                {proof.delivered ? 'Delivered' : 'Not yet delivered'}
              </span>
            </div>
          )}

          {!loading && evidence.length === 0 && (
            <span style={{ ...t('meta'), color: T.textMuted }}>No evidence uploaded</span>
          )}

          {!loading && evidence.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {evidence.map(ev => (
                <a
                  key={ev.id}
                  href={ev.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...surface({ pad: S[2], radius: 'var(--r-sm)' }), display: 'flex', alignItems: 'center', gap: S[2], textDecoration: 'none' }}
                >
                  {isImageType(ev.file_type) ? (
                    <img
                      src={ev.file_url}
                      alt="Evidence"
                      style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <span style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <PaperclipIcon size={16} color={T.textMuted} />
                    </span>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ ...t('meta'), color: T.text }}>
                      {roleLabel(ev.role)} — {shortWallet(ev.uploaded_by)}
                    </span>
                    {ev.note && (
                      <span style={{ ...t('micro'), color: T.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.note}
                      </span>
                    )}
                  </div>
                  <span style={{ ...t('micro'), color: T.textMuted, marginLeft: 'auto', flexShrink: 0 }}>
                    {timeAgo(ev.created_at)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Single dispute card
// ──────────────────────────────────────────────────────────────
function DisputeCard({
  dispute,
  wallet,
  token,
  onRefresh,
}: {
  dispute: Dispute;
  wallet: string;
  token: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = dispute.status === 'open' || dispute.status === 'under_review';

  async function patchAction(action: 'under_review' | 'deny' | 'refund') {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch('/api/disputes/resolve', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wallet, dispute_id: dispute.id, action }),
      });
      if (!res.ok) {
        let msg = 'Action failed';
        try {
          const j = await res.json();
          msg = j?.error || j?.message || msg;
        } catch {
          msg = (await res.text()) || msg;
        }
        setError(msg);
        setArmed(false);
        return;
      }
      setArmed(false);
      onRefresh();
    } catch {
      setError('Network error — try again');
      setArmed(false);
    } finally {
      setBusy(null);
    }
  }

  const refundAmount =
    dispute.refund_amount_usd != null ? Number(dispute.refund_amount_usd) : null;

  return (
    <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: S[3] }}>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: S[2] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
            <span
              style={{
                ...badge('danger'),
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {/* alert icon */}
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              {KIND_LABEL[dispute.kind] ?? dispute.kind}
            </span>
            {dispute.item_id && (
              <Link
                href={`/item/${dispute.item_id}`}
                target="_blank"
                style={{ ...t('meta'), color: 'var(--accent)', textDecoration: 'none' }}
              >
                View item
              </Link>
            )}
          </div>
          {refundAmount != null && (
            <span style={price('sm')}>${refundAmount.toFixed(2)}</span>
          )}
        </div>
        <span style={{ ...t('micro'), color: T.textMuted, flexShrink: 0 }}>
          {timeAgo(dispute.created_at)}
        </span>
      </div>

      {/* reason */}
      {dispute.reason && (
        <div style={{ ...surface({ pad: S[3], radius: 'var(--r-sm)' }) }}>
          <p style={{ ...t('body'), color: T.text, margin: 0 }}>{dispute.reason}</p>
        </div>
      )}

      {/* parties */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[1] }}>
          <span style={{ ...t('micro'), color: T.textMuted }}>BUYER</span>
          <span style={{ ...t('meta'), color: T.textMuted, fontFamily: 'monospace' }}>
            {shortWallet(dispute.buyer_wallet)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[1] }}>
          <span style={{ ...t('micro'), color: T.textMuted }}>SELLER</span>
          <span style={{ ...t('meta'), color: T.textMuted, fontFamily: 'monospace' }}>
            {shortWallet(dispute.seller_wallet)}
          </span>
        </div>
      </div>

      {/* resolution note (for resolved disputes) */}
      {!active && dispute.resolution_note && (
        <span style={{ ...t('meta'), color: T.textMuted }}>{dispute.resolution_note}</span>
      )}

      {/* evidence + proof of delivery */}
      <EvidenceViewer disputeId={dispute.id} wallet={wallet} token={token} />

      {/* 6.6 — compile the printable chargeback evidence bundle for this order */}
      <Link href={`/admin/chargeback/${dispute.order_id}`} style={{ ...btn('text'), padding: `${S[1]}px ${S[2]}px`, alignSelf: 'flex-start' }}>
        Chargeback bundle →
      </Link>

      {error && (
        <div style={{ ...surface({ pad: S[3], radius: 'var(--r-sm)' }), borderColor: 'var(--danger-soft)' }}>
          <p style={{ ...t('body'), color: C.red, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* actions */}
      {active && (
        <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap', paddingTop: S[1], borderTop: '1px solid var(--divider)' }}>
          {dispute.status === 'open' && (
            <button
              style={{ ...btn('secondary'), fontSize: 13, padding: '10px 16px' }}
              disabled={busy !== null}
              onClick={() => patchAction('under_review')}
            >
              {busy === 'under_review' ? 'Working…' : 'Mark under review'}
            </button>
          )}
          <button
            style={{ ...btn('text'), fontSize: 13, color: T.textMuted }}
            disabled={busy !== null}
            onClick={() => patchAction('deny')}
          >
            {busy === 'deny' ? 'Denying…' : 'Deny'}
          </button>
          <button
            style={{ ...btn('danger'), fontSize: 13, padding: '10px 16px', marginLeft: 'auto' }}
            disabled={busy !== null}
            onClick={() => {
              if (armed) {
                patchAction('refund');
              } else {
                setArmed(true);
                setError(null);
              }
            }}
          >
            {busy === 'refund'
              ? 'Refunding…'
              : armed
                ? 'Confirm refund?'
                : 'Refund buyer'}
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────
const STATUS_TABS: { label: string; value: DisputeStatus }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Under review', value: 'under_review' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Denied', value: 'denied' },
];

export default function AdminDisputesPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DisputeStatus>('open');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready || !wallet) return;
    getAccessToken().then(tok => setToken(tok ?? null));
  }, [ready, wallet, getAccessToken]);

  const { isAdmin, loading: adminLoading } = useAdminRole();

  const fetchDisputes = useCallback(async () => {
    if (!wallet || !token || !isAdmin) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/disputes/resolve?wallet=${encodeURIComponent(wallet)}&status=${activeTab}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      setDisputes(Array.isArray(json.disputes) ? json.disputes : []);
    } catch {
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, [wallet, token, isAdmin, activeTab]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const tabs = tabSlider();

  // ── Not authorized ──
  if (ready && !adminLoading && !isAdmin) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: S[3],
          padding: S[5],
        }}
      >
        {/* lock icon */}
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <p style={{ ...t('heading'), color: T.textMuted, margin: 0 }}>Not authorized</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: S[8] }}>
      {/* Sticky header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
          WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
          background: 'var(--glass-bg)',
          borderBottom: '1px solid var(--glass-border)',
          padding: `${S[4]}px ${S[4]}px ${S[3]}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: S[3],
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
          {/* scale / dispute icon */}
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18"/>
            <path d="M3 7h18"/>
            <path d="m3 7 3 6a3 3 0 0 0 6 0"/>
            <path d="m15 13 3-6 3 6a3 3 0 0 1-6 0"/>
          </svg>
          <h1 style={{ ...t('title'), color: T.textStrong, margin: 0 }}>Disputes</h1>
          <Link href="/admin/reports" style={{ ...btn('text'), marginLeft: 'auto', padding: `${S[1]}px ${S[2]}px` }}>
            Reports
          </Link>
          <HeaderMenu />
        </div>

        {/* tab slider */}
        <div style={tabs.wrap}>
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              style={{
                ...tabs.item,
                ...(activeTab === tab.value ? tabs.itemActive : {}),
              }}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: `${S[4]}px ${S[4]}px`, display: 'flex', flexDirection: 'column', gap: S[3] }}>
        {/* section label */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={sectionLabel()}>
            {activeTab.replace('_', ' ').toUpperCase()} DISPUTES
          </span>
          <button
            style={{ ...btn('text'), padding: '6px 10px', fontSize: 12 }}
            onClick={fetchDisputes}
            disabled={loading}
          >
            {/* refresh icon */}
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: `${S[6]}px 0` }}>
            <span style={{ ...t('body'), color: T.textMuted }}>Loading…</span>
          </div>
        )}

        {!loading && disputes.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: `${S[6]}px ${S[4]}px`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: S[2],
            }}
          >
            {/* inbox icon */}
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
            </svg>
            <span style={{ ...t('body'), color: T.textMuted }}>
              No {activeTab.replace('_', ' ')} disputes
            </span>
          </div>
        )}

        {!loading &&
          disputes.map(dispute =>
            token && wallet ? (
              <DisputeCard
                key={dispute.id}
                dispute={dispute}
                wallet={wallet}
                token={token}
                onRefresh={fetchDisputes}
              />
            ) : null,
          )}
      </div>
    </div>
  );
}
