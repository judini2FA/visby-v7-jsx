'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { isAdminWallet } from '@/lib/admin';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, card, surface, btn, badge, sectionLabel, tabSlider, T } from '@/lib/ui';

const C = {
  green: 'var(--ok)',
  red: 'var(--danger)',
  amber: 'var(--warn)',
  aqua: '#25CDB8',
};

type ReportStatus = 'open' | 'reviewed' | 'actioned' | 'dismissed';

interface Report {
  id: string;
  target_type: 'listing' | 'seller' | 'message';
  target_id: string;
  reason: string;
  details: string | null;
  reporter_wallet: string;
  status: ReportStatus;
  created_at: string;
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

// ──────────────────────────────────────────────────────────────
// Auth-status action button row for listing reports
// ──────────────────────────────────────────────────────────────
function AuthActions({
  itemId,
  wallet,
  token,
  onDone,
}: {
  itemId: string;
  wallet: string;
  token: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function setAuthStatus(auth_status: 'authenticated' | 'flagged') {
    setBusy(auth_status);
    try {
      await fetch('/api/items/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wallet, item_id: itemId, auth_status }),
      });
      onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
      <button
        style={{ ...btn('secondary'), fontSize: 12, padding: '8px 14px', color: C.green, borderColor: 'var(--ok-soft)' }}
        disabled={busy !== null}
        onClick={() => setAuthStatus('authenticated')}
      >
        {/* shield-check */}
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
        {busy === 'authenticated' ? 'Working…' : 'Authenticate'}
      </button>
      <button
        style={{ ...btn('danger'), fontSize: 12, padding: '8px 14px' }}
        disabled={busy !== null}
        onClick={() => setAuthStatus('flagged')}
      >
        {/* flag */}
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
        {busy === 'flagged' ? 'Working…' : 'Flag Item'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Single report card
// ──────────────────────────────────────────────────────────────
function ReportCard({
  report,
  wallet,
  token,
  onRefresh,
}: {
  report: Report;
  wallet: string;
  token: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function updateStatus(status: 'dismissed' | 'actioned') {
    setBusy(status);
    try {
      await fetch('/api/moderation', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wallet, report_id: report.id, status }),
      });
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  async function enforce(action: 'force_delist' | 'flag_user') {
    setBusy(action);
    try {
      const res = await fetch('/api/moderation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, report_id: report.id, action, target_id: report.target_id }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert((b as any).error ?? 'Action failed');
        return;
      }
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  // Messages have no public page — a message id linked to /item or /p would 404, so leave it plain text.
  const targetHref =
    report.target_type === 'listing'
      ? `/item/${report.target_id}`
      : report.target_type === 'seller'
        ? `/p/${report.target_id}`
        : null;

  return (
    <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: S[3] }}>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: S[2] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          {/* target type + link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <span
              style={{
                ...badge(report.target_type === 'listing' ? 'default' : 'default'),
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: 10,
              }}
            >
              {report.target_type === 'listing' ? (
                // tag icon
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
              ) : report.target_type === 'seller' ? (
                // person icon
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              ) : (
                // message icon
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              )}
              {report.target_type}
            </span>
            {targetHref ? (
              <Link
                href={targetHref}
                target="_blank"
                style={{ ...t('meta'), color: 'var(--accent)', textDecoration: 'none', wordBreak: 'break-all' }}
              >
                {shortWallet(report.target_id)}
              </Link>
            ) : (
              <span style={{ ...t('meta'), color: T.textMuted, wordBreak: 'break-all' }}>
                {shortWallet(report.target_id)}
              </span>
            )}
          </div>
          {/* reason */}
          <span style={{ ...t('heading'), color: T.textStrong }}>{report.reason}</span>
        </div>
        {/* time */}
        <span style={{ ...t('micro'), color: T.textMuted, flexShrink: 0 }}>
          {timeAgo(report.created_at)}
        </span>
      </div>

      {/* details */}
      {report.details && (
        <div style={{ ...surface({ pad: S[3], radius: 8 }) }}>
          <p style={{ ...t('body'), color: T.text, margin: 0 }}>{report.details}</p>
        </div>
      )}

      {/* reporter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: S[1] }}>
        <span style={{ ...t('micro'), color: T.textMuted }}>REPORTER</span>
        <span style={{ ...t('meta'), color: T.textMuted, fontFamily: 'monospace' }}>
          {shortWallet(report.reporter_wallet)}
        </span>
      </div>

      {/* auth actions (listing only) */}
      {report.target_type === 'listing' && (
        <AuthActions
          itemId={report.target_id}
          wallet={wallet}
          token={token}
          onDone={onRefresh}
        />
      )}

      {/* enforcement: pull a listing off sale, or flag a seller account */}
      {(report.target_type === 'listing' || report.target_type === 'seller') && (
        <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
          {report.target_type === 'listing' && (
            <button
              style={{ ...btn('danger'), fontSize: 12, padding: '8px 14px' }}
              disabled={busy !== null}
              onClick={() => enforce('force_delist')}
            >
              {/* slash-circle */}
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
              {busy === 'force_delist' ? 'Delisting…' : 'Delist item'}
            </button>
          )}
          {report.target_type === 'seller' && (
            <button
              style={{ ...btn('danger'), fontSize: 12, padding: '8px 14px' }}
              disabled={busy !== null}
              onClick={() => enforce('flag_user')}
            >
              {/* user-x */}
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/>
              </svg>
              {busy === 'flag_user' ? 'Flagging…' : 'Flag user'}
            </button>
          )}
        </div>
      )}

      {/* moderation actions */}
      <div style={{ display: 'flex', gap: S[2], paddingTop: S[1], borderTop: '1px solid var(--divider)' }}>
        <button
          style={{ ...btn('text'), fontSize: 13, color: T.textMuted }}
          disabled={busy !== null}
          onClick={() => updateStatus('dismissed')}
        >
          {busy === 'dismissed' ? 'Dismissing…' : 'Dismiss'}
        </button>
        <button
          style={{ ...btn('primary'), fontSize: 13, padding: '10px 18px' }}
          disabled={busy !== null}
          onClick={() => updateStatus('actioned')}
        >
          {busy === 'actioned' ? 'Working…' : 'Mark Actioned'}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────
const STATUS_TABS: { label: string; value: ReportStatus }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Actioned', value: 'actioned' },
  { label: 'Dismissed', value: 'dismissed' },
];

export default function AdminReportsPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportStatus>('open');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  // Resolve token once wallet is ready
  useEffect(() => {
    if (!ready || !wallet) return;
    getAccessToken().then(tok => setToken(tok ?? null));
  }, [ready, wallet, getAccessToken]);

  const isAdmin = isAdminWallet(wallet);

  const fetchReports = useCallback(async () => {
    if (!wallet || !token || !isAdmin) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/moderation?wallet=${encodeURIComponent(wallet)}&status=${activeTab}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      setReports(Array.isArray(json.reports) ? json.reports : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [wallet, token, isAdmin, activeTab]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const tabs = tabSlider();

  // ── Not authorized ──
  if (ready && !isAdmin) {
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
          {/* shield icon */}
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <h1 style={{ ...t('title'), color: T.textStrong, margin: 0 }}>Moderation</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginLeft: 'auto' }}>
            <Link href="/admin/disputes" style={{ ...btn('text'), fontSize: 13 }}>
              Disputes
            </Link>
            <HeaderMenu />
          </div>
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
            {activeTab.toUpperCase()} REPORTS
          </span>
          <button
            style={{ ...btn('text'), padding: '6px 10px', fontSize: 12 }}
            onClick={fetchReports}
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

        {!loading && reports.length === 0 && (
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
            <span style={{ ...t('body'), color: T.textMuted }}>No {activeTab} reports</span>
          </div>
        )}

        {!loading &&
          reports.map(report =>
            token && wallet ? (
              <ReportCard
                key={report.id}
                report={report}
                wallet={wallet}
                token={token}
                onRefresh={fetchReports}
              />
            ) : null,
          )}
      </div>
    </div>
  );
}
