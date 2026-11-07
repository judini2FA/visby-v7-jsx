'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, T, surface, btn, badge, input, sectionLabel, tabSlider } from '@/lib/ui';
import { HUB_URL } from '@/lib/links-config';

type Contact = {
  id: string; email: string; name: string | null; is_student: boolean | null; docs: string[];
  sources: string[]; prior_records: string[]; status: string; first_seen: string; last_seen: string; visits: number; links: string[]; identified: boolean;
};
type Anon = { id: string; status: string; visits: number; first_seen: string; last_seen: string; links: string[] };
type Invite = { id: string; token: string; label: string; contact_id: string | null; uses: number; last_used_at: string | null; revoked_at: string | null; created_at: string };
type Metrics = {
  totalVisits: number; uniqueVisitors: number; identifiedVisitors: number; identificationRate: number; emailsCollected: number;
  returningVisitors: number; investors: number; students: number; docRequests: Record<string, number>;
  clicks: Record<string, number>; campaigns: Record<string, number>;
};

const STATUS_LABEL: Record<string, string> = {
  anonymous: 'Anonymous', returning: 'Returning anonymous', known_contact: 'Prelaunch signup', self_reported: 'Gave email',
  conflict: 'Two emails on one device', invited: 'Invited (not yet seen)',
};

const kind = (c: Contact) => (c.is_student === true ? 'Student' : c.is_student === false ? 'Investor' : '');

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

function csvCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join(' ') : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

function downloadCsv(rows: Contact[]) {
  const head = ['email', 'type', 'documents_requested', 'name', 'sources', 'status', 'existing_records', 'first_seen', 'last_seen', 'visits', 'links_clicked'];
  const lines = rows.map(r => [r.email, kind(r), r.docs, r.name, r.sources, STATUS_LABEL[r.status] ?? r.status, r.prior_records, r.first_seen, r.last_seen, r.visits, r.links].map(csvCell).join(','));
  const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
  download(`visby-links-contacts-${new Date().toISOString().slice(0, 10)}.csv`, url);
  URL.revokeObjectURL(url);
}

// Renders both encodings off-screen-free: the SVG is what's shown, the canvas backs the PNG download.
function QrBlock({ value, name }: { value: string; name: string }) {
  const svgRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: S[4] }}>
      <div ref={svgRef} style={{ background: '#FFFFFF', borderRadius: 'var(--r-sm)', lineHeight: 0 }}>
        <QRCodeSVG value={value} size={144} level="Q" marginSize={4} bgColor="#FFFFFF" fgColor="#000000" />
      </div>
      <div ref={canvasRef} style={{ display: 'none' }}>
        <QRCodeCanvas value={value} size={1024} level="Q" marginSize={4} bgColor="#FFFFFF" fgColor="#000000" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2], minWidth: 0, flex: '1 1 200px' }}>
        <code style={{ ...t('meta'), color: T.text, wordBreak: 'break-all' }}>{value}</code>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
          <button type="button" style={btn('secondary')} onClick={() => {
            const c = canvasRef.current?.querySelector('canvas');
            if (c) download(`${name}.png`, c.toDataURL('image/png'));
          }}>PNG</button>
          <button type="button" style={btn('secondary')} onClick={() => {
            const svg = svgRef.current?.querySelector('svg');
            if (!svg) return;
            const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
            download(`${name}.svg`, url);
            URL.revokeObjectURL(url);
          }}>SVG</button>
          <button type="button" style={btn('text')} onClick={() => navigator.clipboard?.writeText(value).catch(() => {})}>Copy link</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLinksPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [state, setState] = useState<'loading' | 'forbidden' | 'unmigrated' | 'ready'>('loading');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [links, setLinks] = useState<{ id: string; label: string }[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [anon, setAnon] = useState<Anon[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [tab, setTab] = useState<'contacts' | 'anonymous' | 'qr'>('contacts');
  const [q, setQ] = useState('');
  const [who, setWho] = useState<'all' | 'Investor' | 'Student'>('all');
  const [campaign, setCampaign] = useState('');
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    const token = await getAccessToken();
    const res = await fetch(`/api/admin/links?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setState('forbidden'); return; }
    const d = await res.json();
    if (!d.migrated) { setState('unmigrated'); return; }
    setMetrics(d.metrics); setLinks(d.links); setContacts(d.contacts); setAnon(d.anonymous); setInvites(d.invites);
    setState('ready');
  }, [wallet, getAccessToken]);

  useEffect(() => { if (ready && wallet) load().catch(() => setState('forbidden')); }, [ready, wallet, load]);

  async function act(payload: Record<string, unknown>) {
    const token = await getAccessToken();
    const res = await fetch('/api/admin/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wallet, ...payload }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(d.error ?? 'Something went wrong'); return null; }
    setMsg(null);
    await load();
    return d;
  }

  const linkLabel = useMemo(() => Object.fromEntries(links.map(l => [l.id, l.label])), [links]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return contacts.filter(c => (who === 'all' || kind(c) === who) && (!n || [c.email, c.name].some(v => v?.toLowerCase().includes(n))));
  }, [contacts, q, who]);

  if (state === 'loading') return <p style={{ ...t('meta'), color: T.textMuted, padding: S[5], textAlign: 'center' }}>Loading…</p>;
  if (state === 'forbidden') return <p style={{ ...t('heading'), color: T.textMuted, padding: S[5], textAlign: 'center' }}>Super admin only</p>;
  if (state === 'unmigrated') {
    return (
      <div className="visby-inner" style={{ paddingTop: S[5] }}>
        <div style={{ ...surface({ pad: S[4] }), ...t('body'), color: T.textStrong }}>
          The links hub tables don&apos;t exist yet. Run <code>migration_links_hub.sql</code> in Supabase.
        </div>
      </div>
    );
  }

  const m = metrics!;
  const slider = tabSlider();
  const campaignSlug = campaign.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '').slice(0, 40);
  const tiles: [string, string][] = [
    ['Total visits', m.totalVisits.toLocaleString()],
    ['Unique visitors', m.uniqueVisitors.toLocaleString()],
    ['Emails collected', m.emailsCollected.toLocaleString()],
    ['Investors', m.investors.toLocaleString()],
    ['Students', m.students.toLocaleString()],
    ['Returning', m.returningVisitors.toLocaleString()],
    ...links.map(l => (m.docRequests[l.id] != null || /^Get free copy/.test(l.label)
      ? [`${l.label.replace(/^Get free copy of /, '')} requests`, (m.docRequests[l.id] ?? 0).toLocaleString()]
      : [`${l.label} clicks`, (m.clicks[l.id] ?? 0).toLocaleString()]) as [string, string]),
  ];

  return (
    <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: S[8], display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: S[3] }}>
        {tiles.map(([label, n]) => (
          <div key={label} style={surface({ pad: S[4] })}>
            <div style={sectionLabel()}>{label}</div>
            <div style={{ ...t('title'), color: T.textStrong, marginTop: S[1] }}>{n}</div>
          </div>
        ))}
      </div>
      <p style={{ ...t('meta'), color: T.textMuted, margin: 0 }}>
        Emails come from the free-copy form in front of each document. Anyone who didn&apos;t tick &quot;I&apos;m a student&quot; is counted as an investor.
        {Object.keys(m.campaigns).length > 0 && ` Campaign sessions: ${Object.entries(m.campaigns).map(([k, v]) => `${k} ${v}`).join(' · ')}.`}
      </p>

      <div style={slider.wrap}>
        {(['contacts', 'anonymous', 'qr'] as const).map(k => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ ...slider.item, ...(tab === k ? slider.itemActive : null) }}>
            {k === 'contacts' ? `Contacts (${contacts.length})` : k === 'anonymous' ? `Anonymous (${anon.length})` : 'QR & invites'}
          </button>
        ))}
      </div>

      {msg && <p role="alert" style={{ ...t('meta'), color: 'var(--danger)', margin: 0 }}>{msg}</p>}

      {tab === 'contacts' && (
        <>
          <div style={{ display: 'flex', gap: S[2] }}>
            {(['all', 'Investor', 'Student'] as const).map(k => (
              <button key={k} type="button" aria-pressed={who === k} onClick={() => setWho(k)} style={btn(who === k ? 'primary' : 'secondary')}>
                {k === 'all' ? 'All' : `${k}s`}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: S[2] }}>
            <input placeholder="Search email" value={q} onChange={e => setQ(e.target.value)} style={{ ...input(), flex: 1, minWidth: 0 }} />
            <button type="button" onClick={() => downloadCsv(shown)} disabled={!shown.length} style={btn('secondary')}>Export CSV</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {shown.map(c => (
              <div key={c.id} style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: S[2] }}>
                  <a href={`mailto:${c.email}`} style={{ ...t('heading'), color: T.textStrong, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</a>
                  {kind(c) && <span style={badge(kind(c) === 'Investor' ? 'success' : 'default')}>{kind(c)}</span>}
                  <span style={{ ...t('meta'), color: c.status === 'conflict' ? 'var(--danger)' : T.text, marginLeft: 'auto' }}>{STATUS_LABEL[c.status] ?? c.status}</span>
                </div>
                <div style={{ ...t('meta'), color: T.textMuted, display: 'flex', flexWrap: 'wrap', gap: S[3] }}>
                  {c.docs.length > 0 && <span>Requested: {c.docs.map(d => (linkLabel[d] ?? d).replace(/^Get free copy of /, '')).join(', ')}</span>}
                  <span>Source: {c.sources.join(', ')}</span>
                  {c.prior_records.length > 0 && <span>Existing: {c.prior_records.join(', ')}</span>}
                  <span>{c.visits} visit{c.visits === 1 ? '' : 's'}</span>
                  <span>First {fmtDate(c.first_seen)} · Last {fmtDate(c.last_seen)}</span>
                  {c.links.length > 0 && <span>Clicked: {c.links.map(l => linkLabel[l] ?? l).join(', ')}</span>}
                  <button type="button" style={{ ...btn('text'), ...t('meta'), padding: 0, marginLeft: 'auto' }} onClick={() => {
                    if (confirm(`Permanently delete ${c.email} and its records?`)) act({ action: 'delete_contact', id: c.id });
                  }}>Delete</button>
                </div>
              </div>
            ))}
            {shown.length === 0 && <p style={{ ...t('meta'), color: T.textMuted, textAlign: 'center' }}>No contacts yet</p>}
          </div>
        </>
      )}

      {tab === 'anonymous' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {anon.map(v => (
            <div key={v.id} style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: S[3], ...t('meta'), color: T.textMuted }}>
              <code style={{ color: T.text }}>{v.id.slice(0, 8)}</code>
              <span>{STATUS_LABEL[v.status] ?? v.status}</span>
              <span>{v.visits} visit{v.visits === 1 ? '' : 's'}</span>
              {v.links.length > 0 && <span>Clicked: {v.links.map(l => linkLabel[l] ?? l).join(', ')}</span>}
              <span style={{ marginLeft: 'auto' }}>{fmtDate(v.last_seen)}</span>
            </div>
          ))}
          {anon.length === 0 && <p style={{ ...t('meta'), color: T.textMuted, textAlign: 'center' }}>No anonymous visitors yet</p>}
        </div>
      )}

      {tab === 'qr' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <div style={surface({ pad: S[4] })}>
            <div style={{ ...sectionLabel(), marginBottom: S[3] }}>Main QR code</div>
            <QrBlock value={HUB_URL} name="visby-links-qr" />
          </div>

          <div style={surface({ pad: S[4] })}>
            <div style={{ ...sectionLabel(), marginBottom: S[3] }}>Campaign QR code</div>
            <input placeholder="Campaign name, e.g. demo-day" value={campaign} onChange={e => setCampaign(e.target.value)} style={{ ...input(), width: '100%', marginBottom: S[3] }} />
            {campaignSlug && <QrBlock value={`${HUB_URL}?c=${campaignSlug}`} name={`visby-links-${campaignSlug}`} />}
          </div>

          <div style={surface({ pad: S[4] })}>
            <div style={sectionLabel()}>Personal invite links</div>
            <p style={{ ...t('meta'), color: T.textMuted, margin: `${S[1]}px 0 ${S[3]}px` }}>
              Each link carries a random token. A visit shows the invite was opened, not who opened it — forwarded links look the same.
            </p>
            <form onSubmit={e => { e.preventDefault(); act({ action: 'create_invite', label: inviteLabel, email: inviteEmail || undefined }).then(d => { if (d) { setInviteLabel(''); setInviteEmail(''); } }); }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
              <input required placeholder="Recipient or label" value={inviteLabel} onChange={e => setInviteLabel(e.target.value)} style={{ ...input(), flex: '1 1 160px', minWidth: 0 }} />
              <input type="email" placeholder="Email (optional)" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ ...input(), flex: '1 1 160px', minWidth: 0 }} />
              <button type="submit" style={btn('primary')}>Create</button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[4], marginTop: S[4] }}>
              {invites.map(i => (
                <div key={i.id} style={{ display: 'flex', flexDirection: 'column', gap: S[2], opacity: i.revoked_at ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: S[2] }}>
                    <span style={{ ...t('heading'), color: T.textStrong }}>{i.label}</span>
                    <span style={{ ...t('meta'), color: T.textMuted }}>{i.uses} use{i.uses === 1 ? '' : 's'}{i.last_used_at ? ` · last ${fmtDate(i.last_used_at)}` : ''}{i.revoked_at ? ' · revoked' : ''}</span>
                    {!i.revoked_at && <button type="button" style={{ ...btn('text'), marginLeft: 'auto' }} onClick={() => act({ action: 'revoke_invite', id: i.id })}>Revoke</button>}
                  </div>
                  {!i.revoked_at && <QrBlock value={`${HUB_URL}?i=${i.token}`} name={`visby-invite-${i.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />}
                </div>
              ))}
              {invites.length === 0 && <p style={{ ...t('meta'), color: T.textMuted, margin: 0 }}>No invites yet</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
