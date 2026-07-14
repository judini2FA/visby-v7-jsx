'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, card, surface, btn, badge, sectionLabel, input, T } from '@/lib/ui';
import { AddressForm, EMPTY_SHIP_TO, shipToValid, type ShipTo } from '@/components/address-form';
import { friendlyError } from '@/lib/friendly-error';

type AccountType = 'personal' | 'business';
type VerificationStatus = 'pending' | 'approved' | 'rejected';
type Verification = {
  id: string;
  wallet: string;
  legal_name: string | null;
  business_type: string | null;
  status: VerificationStatus;
  created_at: string;
  updated_at: string;
} | null;

const BUSINESS_TYPES = ['LLC', 'Corporation', 'Sole Proprietorship', 'Partnership', 'Nonprofit', 'Other'];
const RED = 'var(--danger)';

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled}
      style={{ width: 44, height: 26, borderRadius: 13, background: on ? 'var(--grad-brand)' : 'var(--surface-bg)', backgroundClip: 'border-box', backgroundOrigin: 'border-box', backgroundSize: '100% 100%', border: `1.5px solid ${on ? 'transparent' : 'var(--glass-border)'}`, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.28)', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all .2s', flexShrink: 0, padding: 0 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--text-muted)', position: 'absolute', top: 1, left: on ? 20 : 1, transition: 'left .2s, background .2s' }} />
    </button>
  );
}

type Mode = 'idle' | 'confirm' | 'form';

export default function BusinessSettings({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [verification, setVerification] = useState<Verification>(null);
  const [selfShip, setSelfShip] = useState(false);
  const [shipBusy, setShipBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');

  // form fields
  const [legalName, setLegalName] = useState('');
  const [ein, setEin] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [address, setAddress] = useState<ShipTo>(EMPTY_SHIP_TO);
  const [website, setWebsite] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docName, setDocName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!wallet) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const [kycRes, verRes] = await Promise.all([
        fetch('/api/kyc/status', { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/business/verification?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (kycRes.ok) {
        const j = await kycRes.json();
        setAccountType(j.account_type === 'business' ? 'business' : 'personal');
      }
      if (verRes.ok) {
        const j = await verRes.json();
        setVerification(j.verification ?? null);
        setSelfShip(!!j.self_ship);
      }
    } catch { /* best-effort */ } finally {
      setLoading(false);
    }
  }, [wallet, getAccessToken]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setLegalName(''); setEin(''); setBusinessType(''); setAddress(EMPTY_SHIP_TO);
    setWebsite(''); setDocUrl(''); setDocName(''); setError('');
  }

  async function uploadDoc(file: File) {
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = await getAccessToken();
      const res = await fetch('/api/upload-image', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) throw new Error(j.error ?? 'Upload failed');
      setDocUrl(j.url);
      setDocName(file.name);
    } catch (err: any) {
      setError(friendlyError(err, 'Could not upload document — try again.'));
    } finally {
      setUploading(false);
    }
  }

  function einValid(v: string): boolean {
    return /^(\d{2}-\d{7}|\d{9})$/.test(v.trim());
  }

  async function submitVerification(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || uploading) return;
    if (!legalName.trim()) { setError('Enter the business legal name'); return; }
    if (!einValid(ein)) { setError('EIN must be formatted XX-XXXXXXX or 9 digits'); return; }
    if (!businessType) { setError('Select a business type'); return; }
    if (!shipToValid(address)) { setError('Enter a complete business address'); return; }
    setSubmitting(true); setError('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/business/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          wallet, legal_name: legalName.trim(), ein: ein.trim(), business_type: businessType,
          business_address: address, website: website.trim() || undefined, doc_url: docUrl || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Could not submit — try again');
      setMode('idle');
      resetForm();
      await load();
    } catch (err: any) {
      setError(friendlyError(err, 'Could not submit — try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleSelfShip() {
    if (shipBusy) return;
    const next = !selfShip;
    setShipBusy(true);
    setSelfShip(next); // optimistic
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/business/verification', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ wallet, self_ship: next }),
      });
      if (!res.ok) setSelfShip(!next); // revert on failure
    } catch {
      setSelfShip(!next);
    } finally {
      setShipBusy(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '14px 16px', ...t('meta'), color: T.textMuted }}>Loading…</div>;
  }

  // ── Business account: badge + self-ship toggle ──────────────────────────
  if (accountType === 'business') {
    const status = verification?.status;
    const pill =
      status === 'approved' ? { text: 'Verified business', variant: 'success' as const } :
      status === 'rejected' ? { text: 'Verification rejected', variant: 'danger' as const } :
      status === 'pending'  ? { text: 'Verification pending review', variant: 'default' as const } :
      { text: 'Business account', variant: 'default' as const };

    return (
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <span style={{ ...badge(pill.variant), alignSelf: 'flex-start', letterSpacing: 0, textTransform: 'none' }}>{pill.text}</span>
        {status === 'rejected' && (
          <div style={{ ...t('meta'), color: T.textMuted, lineHeight: 1.5 }}>
            Your last submission wasn&apos;t approved. Contact support if you believe this is a mistake.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>Ship my own orders</div>
            <div style={{ ...t('meta'), color: T.textMuted }}>Handle fulfillment yourself instead of Visby&apos;s default shipping flow</div>
          </div>
          <Toggle on={selfShip} onToggle={toggleSelfShip} disabled={shipBusy} />
        </div>
      </div>
    );
  }

  // ── Personal account: pending review from a prior submission ────────────
  if (verification?.status === 'pending' && mode === 'idle') {
    return (
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <span style={{ ...badge('default'), alignSelf: 'flex-start', letterSpacing: 0, textTransform: 'none' }}>Verification pending review</span>
        <div style={{ ...t('meta'), color: T.textMuted, lineHeight: 1.5 }}>
          We received your business verification for &ldquo;{verification.legal_name}&rdquo;. This is usually reviewed within a few business days — we&apos;ll notify you once it&apos;s approved.
        </div>
      </div>
    );
  }

  // ── Personal account: confirm step ───────────────────────────────────────
  if (mode === 'confirm') {
    return (
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={{ ...t('heading'), color: T.textStrong }}>Switch to a business account?</div>
        <div style={{ ...t('meta'), color: T.textMuted, lineHeight: 1.5 }}>
          Business accounts are for real, registered businesses — not personal collections. You&apos;ll need to verify
          your business once (legal name, EIN, address) before it&apos;s approved. Verified business accounts unlock
          bulk serial-logging tools and the option to ship your own orders. Switching also changes how Visby reports
          your sales for tax purposes.
        </div>
        <div style={{ display: 'flex', gap: S[2] }}>
          <button type="button" onClick={() => setMode('idle')} style={{ ...btn('secondary'), flex: 1 }}>Cancel</button>
          <button type="button" onClick={() => setMode('form')} style={{ ...btn('primary'), flex: 1 }}>Confirm</button>
        </div>
      </div>
    );
  }

  // ── Personal account: verification form ──────────────────────────────────
  if (mode === 'form') {
    const canSubmit = legalName.trim() && einValid(ein) && businessType && shipToValid(address) && !uploading;
    return (
      <form onSubmit={submitVerification} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <div style={sectionLabel()}>Legal business name</div>
          <input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="e.g. Acme Goods LLC" style={input()} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <div style={sectionLabel()}>EIN</div>
          <input value={ein} onChange={e => setEin(e.target.value)} placeholder="XX-XXXXXXX" style={input()} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <div style={sectionLabel()}>Business type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
            {BUSINESS_TYPES.map(bt => (
              <button key={bt} type="button" onClick={() => setBusinessType(bt)}
                style={{ ...btn(businessType === bt ? 'primary' : 'secondary'), padding: '7px 14px' }}>
                {bt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <div style={sectionLabel()}>Business address</div>
          <AddressForm value={address} onChange={setAddress} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <div style={sectionLabel()}>Website (optional)</div>
          <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" style={input()} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <div style={sectionLabel()}>Verification document (optional)</div>
          <div style={{ ...t('meta'), color: T.textMuted }}>Business license, articles of incorporation, or similar.</div>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ ...btn('secondary'), opacity: uploading ? 0.7 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {uploading ? 'Uploading…' : docName ? `Uploaded: ${docName}` : 'Upload document'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(f); }} />
        </div>

        {error && (
          <div style={{ ...badge('danger'), display: 'flex', padding: '12px 16px', borderRadius: 'var(--r-sm)', ...t('body'), letterSpacing: 0, textTransform: 'none' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: S[2] }}>
          <button type="button" onClick={() => { setMode('idle'); resetForm(); }} style={{ ...btn('secondary'), flex: 1 }}>Cancel</button>
          <button type="submit" disabled={!canSubmit || submitting} style={{ ...btn(canSubmit && !submitting ? 'primary' : 'secondary'), flex: 1, opacity: !canSubmit || submitting ? 0.6 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    );
  }

  // ── Personal account: default CTA ────────────────────────────────────────
  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={{ ...t('meta'), color: T.textMuted, lineHeight: 1.5 }}>
        Business accounts unlock bulk serial-logging tools and self-shipping, and require a one-time verification.
      </div>
      <button type="button" onClick={() => setMode('confirm')} style={{ ...btn('secondary'), alignSelf: 'flex-start' }}>
        Switch to a business account
      </button>
      {verification?.status === 'rejected' && (
        <div style={{ ...t('meta'), color: RED }}>Your last submission wasn&apos;t approved — you can try again above.</div>
      )}
    </div>
  );
}
