'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, T, surface, btn, input, sectionLabel, tabSlider } from '@/lib/ui';
import { PRELAUNCH_INTERESTS } from '@/lib/prelaunch-shared';

type Signup = { email: string; ref_code: string; referred_by: string | null; source: string | null; interests: string[]; created_at: string; referrals: number };
type Inquiry = { id: string; name: string; email: string; firm: string | null; message: string; email_sent: boolean; created_at: string };

const LABEL: Record<string, string> = Object.fromEntries(PRELAUNCH_INTERESTS.map(i => [i.id, i.label]));

const fmtDate = (s: string) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function csvCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join(' ') : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: Signup[]) {
  const head = ['email', 'joined', 'ref_code', 'referred_by', 'referrals', 'drop_votes', 'source'];
  const lines = rows.map(r => [r.email, r.created_at, r.ref_code, r.referred_by, r.referrals, r.interests, r.source].map(csvCell).join(','));
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `visby-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AdminWaitlistPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [state, setState] = useState<'loading' | 'forbidden' | 'unmigrated' | 'ready'>('loading');
  const [signups, setSignups] = useState<Signup[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [tab, setTab] = useState<'signups' | 'investors'>('signups');
  const [q, setQ] = useState('');
  const [voteFilter, setVoteFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !wallet) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch(`/api/admin/prelaunch?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setState('forbidden'); return; }
      const d = await res.json();
      setSignups(d.signups ?? []);
      setInquiries(d.inquiries ?? []);
      setState(d.migrated ? 'ready' : 'unmigrated');
    })().catch(() => setState('forbidden'));
  }, [ready, wallet, getAccessToken]);

  const stats = useMemo(() => {
    const dayAgo = Date.now() - 86400000;
    const weekAgo = Date.now() - 7 * 86400000;
    const voters = signups.filter(s => s.interests?.length).length;
    const byInterest = PRELAUNCH_INTERESTS
      .map(i => ({ ...i, n: signups.filter(s => s.interests?.includes(i.id)).length }))
      .sort((a, b) => b.n - a.n);
    return {
      total: signups.length,
      today: signups.filter(s => +new Date(s.created_at) > dayAgo).length,
      week: signups.filter(s => +new Date(s.created_at) > weekAgo).length,
      referred: signups.filter(s => s.referred_by).length,
      byInterest,
      voters,
    };
  }, [signups]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...signups].reverse().filter(s =>
      (!needle || s.email.includes(needle)) && (!voteFilter || s.interests?.includes(voteFilter)));
  }, [signups, q, voteFilter]);

  const topReferrers = useMemo(() => [...signups].filter(s => s.referrals > 0).sort((a, b) => b.referrals - a.referrals).slice(0, 5), [signups]);

  if (state === 'loading') return <p style={{ ...t('meta'), color: T.textMuted, padding: S[5], textAlign: 'center' }}>Loading…</p>;
  if (state === 'forbidden') return <p style={{ ...t('heading'), color: T.textMuted, padding: S[5], textAlign: 'center' }}>Super admin only</p>;

  const slider = tabSlider();

  return (
    <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: S[8], display: 'flex', flexDirection: 'column', gap: S[5] }}>
      {state === 'unmigrated' && (
        <div style={{ ...surface({ pad: S[4] }), ...t('body'), color: T.textStrong }}>
          The prelaunch tables don&apos;t exist yet. Run <code>migration_prelaunch.sql</code> in Supabase.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: S[3] }}>
        {[
          ['Total signups', stats.total],
          ['Last 24h', stats.today],
          ['Last 7 days', stats.week],
          ['Via referral', stats.referred],
          ['Investor notes', inquiries.length],
        ].map(([label, n]) => (
          <div key={label as string} style={surface({ pad: S[4] })}>
            <div style={sectionLabel()}>{label}</div>
            <div style={{ ...t('title'), color: T.textStrong, marginTop: S[1] }}>{(n as number).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: S[3] }}>
        <div style={surface({ pad: S[4] })}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: S[2] }}>
            <div style={sectionLabel()}>Drop category votes</div>
            <span style={{ ...t('meta'), color: T.textMuted }}>{stats.voters} of {stats.total} voted</span>
          </div>
          {stats.byInterest.map((i, rank) => {
            const pct = stats.voters ? Math.round((i.n / stats.voters) * 100) : 0;
            const active = voteFilter === i.id;
            return (
              <button key={i.id} type="button" aria-pressed={active}
                onClick={() => { setVoteFilter(active ? null : i.id); setTab('signups'); }}
                style={{ all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', cursor: 'pointer', marginTop: S[2], padding: `${S[2]}px ${S[3]}px`, borderRadius: 'var(--r-sm)', background: active ? 'var(--glass-bg-strong)' : 'transparent', border: `1px solid ${active ? 'var(--glass-border)' : 'transparent'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: S[2], ...t('body'), color: T.text }}>
                  <span style={{ fontWeight: rank === 0 && i.n > 0 ? 700 : 500 }}>{i.label}</span>
                  <span style={{ fontWeight: 700 }}>{i.n} <span style={{ ...t('meta'), color: T.textMuted }}>· {pct}%</span></span>
                </div>
                <div style={{ height: 4, borderRadius: 'var(--pill)', background: 'var(--divider)', marginTop: S[1], overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', backgroundImage: rank === 0 && i.n > 0 ? 'var(--grad-brand)' : 'none', backgroundColor: 'var(--text-muted)' }} />
                </div>
              </button>
            );
          })}
          <p style={{ ...t('meta'), color: T.textMuted, margin: `${S[2]}px 0 0` }}>Tap a category to see who voted for it.</p>
        </div>
        <div style={surface({ pad: S[4] })}>
          <div style={sectionLabel()}>Top referrers</div>
          {topReferrers.length === 0 && <p style={{ ...t('meta'), color: T.textMuted, margin: `${S[2]}px 0 0` }}>No referrals yet</p>}
          {topReferrers.map(r => (
            <div key={r.ref_code} style={{ display: 'flex', justifyContent: 'space-between', gap: S[2], ...t('body'), color: T.text, marginTop: S[2] }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email}</span><span style={{ fontWeight: 700 }}>{r.referrals}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={slider.wrap}>
        {(['signups', 'investors'] as const).map(k => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ ...slider.item, ...(tab === k ? slider.itemActive : null) }}>
            {k === 'signups' ? `Signups (${signups.length})` : `Investors (${inquiries.length})`}
          </button>
        ))}
      </div>

      {tab === 'signups' ? (
        <>
          {voteFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2], ...t('meta'), color: T.textMuted }}>
              Showing {shown.length} who voted for <strong style={{ color: T.textStrong }}>{LABEL[voteFilter]}</strong>
              <button type="button" onClick={() => setVoteFilter(null)} style={btn('text')}>Clear</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: S[2] }}>
            <input placeholder="Search email" value={q} onChange={e => setQ(e.target.value)} style={{ ...input(), flex: 1, minWidth: 0 }} />
            <button type="button" onClick={() => downloadCsv(shown)} disabled={!shown.length} style={btn('secondary')}>Export CSV</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {shown.map(s => (
              <div key={s.ref_code} style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: S[2] }}>
                <span style={{ ...t('body'), color: T.textStrong, fontWeight: 600, flex: '1 1 200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email}</span>
                {s.referrals > 0 && <span style={{ ...t('meta'), color: T.textMuted }}>{s.referrals} referred</span>}
                <span style={{ ...t('meta'), color: s.interests?.length ? T.text : T.textMuted }}>{s.interests?.length ? `Voted: ${s.interests.map(v => LABEL[v] ?? v).join(', ')}` : 'No vote'}</span>
                <span style={{ ...t('meta'), color: T.textMuted }}>{fmtDate(s.created_at)}</span>
              </div>
            ))}
            {shown.length === 0 && <p style={{ ...t('meta'), color: T.textMuted, textAlign: 'center' }}>No signups yet</p>}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          {inquiries.map(i => (
            <div key={i.id} style={surface({ pad: S[4] })}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: S[2] }}>
                <span style={{ ...t('heading'), color: T.textStrong }}>{i.name}{i.firm ? ` · ${i.firm}` : ''}</span>
                <a href={`mailto:${i.email}`} style={{ ...t('meta'), color: T.sky }}>{i.email}</a>
                <span style={{ ...t('meta'), color: T.textMuted, marginLeft: 'auto' }}>{fmtDate(i.created_at)}{i.email_sent ? '' : ' · email not delivered'}</span>
              </div>
              <p style={{ ...t('body'), color: T.text, margin: `${S[2]}px 0 0`, whiteSpace: 'pre-wrap' }}>{i.message}</p>
            </div>
          ))}
          {inquiries.length === 0 && <p style={{ ...t('meta'), color: T.textMuted, textAlign: 'center' }}>No investor messages yet</p>}
        </div>
      )}
    </div>
  );
}
