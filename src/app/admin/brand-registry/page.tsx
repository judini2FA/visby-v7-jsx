'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, card, surface, btn, badge, sectionLabel, input, T } from '@/lib/ui';

type SerialRule = {
  id: string;
  claim_regex: string;
  valid_regex: string | null;
  range_prefix: string | null;
  range_min: string | null;
  range_max: string | null;
  is_active: boolean;
  note: string | null;
};

type Brand = {
  id: string;
  slug: string;
  display_name: string;
  verified: boolean;
  is_active: boolean;
  created_at: string;
  brand_serial_rules: SerialRule[];
};

type FlagValue = 'revoked' | 'stolen' | 'recalled' | 'allow';

export default function AdminBrandRegistryPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'forbidden' | 'ready'>('loading');
  const [brands, setBrands] = useState<Brand[]>([]);

  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (ready && wallet) getAccessToken().then(t => setToken(t ?? null)); }, [ready, wallet, getAccessToken]);

  const load = useCallback(async () => {
    if (!wallet || !token) return;
    const res = await fetch(`/api/admin/brand-registry?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403) { setState('forbidden'); return; }
    if (!res.ok) { setState('forbidden'); return; }
    const j = await res.json();
    setBrands(Array.isArray(j.brands) ? j.brands : []);
    setState('ready');
  }, [wallet, token]);
  useEffect(() => { load(); }, [load]);

  async function addBrand() {
    if (!slug.trim() || !displayName.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/admin/brand-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, action: 'add_brand', slug: slug.trim(), display_name: displayName.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? 'Could not add brand'); return; }
      setSlug(''); setDisplayName('');
      await load();
    } finally { setBusy(false); }
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
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12c-1 0-3-1-3-3s2-3 2-5c-2 0-3 2-5 2s-2-2-3-2-1 2-3 2-3-2-5-2c0 2 2 3 2 5s-2 3-3 3 1 2 1 4-2 2-2 4c2 0 4-1 6-1s3 2 4 2 2-2 4-2 4 1 6 1c0-2-2-2-2-4s3-2 3-4z"/></svg>
        <h1 style={{ ...t('title'), color: T.textStrong, margin: 0 }}>Brand Registry</h1>
        <div style={{ display: 'flex', gap: S[2], marginLeft: 'auto', alignItems: 'center' }}>
          <Link href="/admin/team" style={{ ...btn('text'), fontSize: 13 }}>Team</Link>
          <HeaderMenu />
        </div>
      </div>

      <div style={{ padding: `${S[4]}px ${S[4]}px`, display: 'flex', flexDirection: 'column', gap: S[4] }}>
        {/* Add brand */}
        <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <span style={sectionLabel()}>Add brand</span>
          <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="slug (a–z, 0–9, hyphen)" style={{ ...input(), fontFamily: 'monospace' }} />
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name" style={{ ...input() }} />
          {err && <span style={{ ...t('meta'), color: 'var(--danger)' }}>{err}</span>}
          <button onClick={addBrand} disabled={!slug.trim() || !displayName.trim() || busy} style={{ ...btn('primary', { full: true }), opacity: !slug.trim() || !displayName.trim() || busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : 'Add brand'}
          </button>
        </div>

        {/* Brands */}
        <div>
          <span style={{ ...sectionLabel(), display: 'block', marginBottom: S[2] }}>Brands ({brands.length})</span>
          {brands.length === 0 ? (
            <p style={{ ...t('body'), color: T.textMuted, margin: 0 }}>No brands yet — add one above.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
              {brands.map(b => (
                <BrandCard key={b.id} brand={b} wallet={wallet} token={token} onChanged={load} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandCard({ brand, wallet, token, onChanged }: { brand: Brand; wallet: string | undefined; token: string | null; onChanged: () => Promise<void> }) {
  const [showRule, setShowRule] = useState(false);
  const [showFlag, setShowFlag] = useState(false);

  return (
    <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...t('heading'), color: T.textStrong }}>{brand.display_name}</div>
          <div style={{ ...t('meta'), color: T.textMuted, fontFamily: 'monospace', marginTop: 2 }}>{brand.slug}</div>
        </div>
        <div style={{ display: 'flex', gap: S[1], alignItems: 'center', flexWrap: 'wrap' }}>
          {brand.verified && <span style={badge('success')}>Verified</span>}
          <span style={brand.is_active ? badge('default') : badge('danger')}>{brand.is_active ? 'Active' : 'Inactive'}</span>
        </div>
      </div>

      {brand.brand_serial_rules.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {brand.brand_serial_rules.map(r => (
            <div key={r.id} style={{ ...surface({ radius: 'var(--r-sm)', pad: '10px 12px' }), display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ ...t('meta'), color: T.text, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                claim: {r.claim_regex}
              </div>
              {r.valid_regex && (
                <div style={{ ...t('meta'), color: T.textMuted, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  valid: {r.valid_regex}
                </div>
              )}
              {(r.range_prefix || r.range_min != null || r.range_max != null) && (
                <div style={{ ...t('micro'), color: T.textMuted }}>
                  range {r.range_prefix ?? ''}{r.range_min ?? ''}–{r.range_max ?? ''}
                </div>
              )}
              {r.note && <div style={{ ...t('meta'), color: T.textMuted }}>{r.note}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: S[2] }}>
        <button onClick={() => { setShowRule(v => !v); setShowFlag(false); }} style={{ ...btn('text'), fontSize: 13 }}>{showRule ? 'Cancel' : 'Add rule'}</button>
        <button onClick={() => { setShowFlag(v => !v); setShowRule(false); }} style={{ ...btn('text'), fontSize: 13 }}>{showFlag ? 'Cancel' : 'Flag serial'}</button>
      </div>

      {showRule && <AddRuleForm brandId={brand.id} wallet={wallet} token={token} onDone={async () => { setShowRule(false); await onChanged(); }} />}
      {showFlag && <FlagSerialForm brandId={brand.id} wallet={wallet} token={token} onDone={onChanged} />}
    </div>
  );
}

function AddRuleForm({ brandId, wallet, token, onDone }: { brandId: string; wallet: string | undefined; token: string | null; onDone: () => Promise<void> }) {
  const [claimRegex, setClaimRegex] = useState('');
  const [validRegex, setValidRegex] = useState('');
  const [rangePrefix, setRangePrefix] = useState('');
  const [rangeMin, setRangeMin] = useState('');
  const [rangeMax, setRangeMax] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!claimRegex.trim() || !validRegex.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/admin/brand-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          wallet, action: 'add_rule', brand_id: brandId,
          claim_regex: claimRegex.trim(),
          valid_regex: validRegex.trim(),
          ...(rangePrefix.trim() ? { range_prefix: rangePrefix.trim() } : null),
          ...(rangeMin.trim() ? { range_min: rangeMin.trim() } : null),
          ...(rangeMax.trim() ? { range_max: rangeMax.trim() } : null),
          ...(note.trim() ? { note: note.trim() } : null),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? 'Could not add rule'); return; }
      await onDone();
    } finally { setBusy(false); }
  }

  return (
    <div style={{ ...surface({ radius: 'var(--r-sm)', pad: S[3] }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <input value={claimRegex} onChange={e => setClaimRegex(e.target.value)} placeholder="claim_regex" style={{ ...input(), fontFamily: 'monospace' }} />
      <input value={validRegex} onChange={e => setValidRegex(e.target.value)} placeholder="valid_regex" style={{ ...input(), fontFamily: 'monospace' }} />
      <div style={{ display: 'flex', gap: S[2] }}>
        <input value={rangePrefix} onChange={e => setRangePrefix(e.target.value)} placeholder="range_prefix" style={{ ...input() }} />
        <input value={rangeMin} onChange={e => setRangeMin(e.target.value)} placeholder="range_min" style={{ ...input() }} />
        <input value={rangeMax} onChange={e => setRangeMax(e.target.value)} placeholder="range_max" style={{ ...input() }} />
      </div>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="note (optional)" style={{ ...input() }} />
      {err && <span style={{ ...t('meta'), color: 'var(--danger)' }}>{err}</span>}
      <button onClick={submit} disabled={!claimRegex.trim() || !validRegex.trim() || busy} style={{ ...btn('primary', { full: true }), opacity: !claimRegex.trim() || !validRegex.trim() || busy ? 0.6 : 1 }}>
        {busy ? 'Working…' : 'Add rule'}
      </button>
    </div>
  );
}

function FlagSerialForm({ brandId, wallet, token, onDone }: { brandId: string; wallet: string | undefined; token: string | null; onDone: () => Promise<void> }) {
  const [serial, setSerial] = useState('');
  const [flag, setFlag] = useState<FlagValue>('revoked');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    if (!serial.trim() || busy) return;
    setBusy(true); setErr(''); setDone(false);
    try {
      const res = await fetch('/api/admin/brand-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, action: 'flag_serial', brand_id: brandId, serial_number: serial.trim(), flag }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? 'Could not flag serial'); return; }
      setSerial(''); setDone(true);
      await onDone();
    } finally { setBusy(false); }
  }

  return (
    <div style={{ ...surface({ radius: 'var(--r-sm)', pad: S[3] }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <input value={serial} onChange={e => { setSerial(e.target.value); setDone(false); }} placeholder="Serial number" style={{ ...input() }} />
      <select value={flag} onChange={e => setFlag(e.target.value as FlagValue)} style={{ ...input() }}>
        <option value="revoked">revoked</option>
        <option value="stolen">stolen</option>
        <option value="recalled">recalled</option>
        <option value="allow">allow</option>
      </select>
      {err && <span style={{ ...t('meta'), color: 'var(--danger)' }}>{err}</span>}
      {done && <span style={{ ...t('meta'), color: 'var(--ok)' }}>Serial flagged.</span>}
      <button onClick={submit} disabled={!serial.trim() || busy} style={{ ...btn('primary', { full: true }), opacity: !serial.trim() || busy ? 0.6 : 1 }}>
        {busy ? 'Working…' : 'Flag serial'}
      </button>
    </div>
  );
}
