'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { useAdminRole } from '@/lib/use-admin-role';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, surface, btn, glass, T } from '@/lib/ui';

type Docs = { terms: string | null; privacy: string | null; acceptable_use: string | null; seller_agreement: string | null };

function UploadRow({ kind, label, current, wallet, token, onDone }: {
  kind: 'terms' | 'privacy' | 'acceptable_use' | 'seller_agreement'; label: string; current: string | null;
  wallet: string | undefined; token: string | null; onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');

  async function upload() {
    if (!picked || !wallet || !token) return;
    setStatus('uploading'); setErr('');
    try {
      const fd = new FormData();
      fd.append('wallet', wallet);
      fd.append('kind', kind);
      fd.append('file', picked);
      const res = await fetch('/api/admin/legal', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Upload failed');
      setStatus('done'); setPicked(null); onDone();
      setTimeout(() => setStatus('idle'), 1600);
    } catch (e: any) {
      setStatus('error'); setErr(e?.message ?? 'Upload failed');
    }
  }

  return (
    <div style={{ ...surface({ pad: S[5], radius: 'var(--r-lg)' }), marginBottom: S[4] }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>{label}</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>
        {current
          ? <>Current: <a href={current} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-strong)', textDecoration: 'underline' }}>view PDF</a></>
          : 'No document uploaded yet — the public page shows a "being finalized" state.'}
      </div>

      <input type="file" ref={fileRef} hidden accept="application/pdf" onChange={e => { setPicked(e.currentTarget.files?.[0] ?? null); setStatus('idle'); setErr(''); }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
        <button onClick={() => fileRef.current?.click()} style={{ ...btn('secondary', { pill: false }) }}>
          {picked ? 'Choose a different PDF' : current ? 'Replace PDF' : 'Choose PDF'}
        </button>
        {picked && (
          <button onClick={upload} disabled={status === 'uploading'} style={{ ...btn('primary', { pill: false }), opacity: status === 'uploading' ? 0.6 : 1 }}>
            {status === 'uploading' ? 'Uploading…' : status === 'done' ? 'Uploaded' : 'Upload'}
          </button>
        )}
      </div>
      {picked && <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[2] }}>{picked.name} · {(picked.size / 1024 / 1024).toFixed(2)} MB</div>}
      {err && <div style={{ ...t('meta'), color: 'var(--danger)', marginTop: S[2] }}>{err}</div>}
    </div>
  );
}

export default function AdminLegalPage() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [token, setToken] = useState<string | null>(null);
  const [docs, setDocs] = useState<Docs>({ terms: null, privacy: null, acceptable_use: null, seller_agreement: null });

  useEffect(() => {
    if (ready && wallet) getAccessToken().then(tok => setToken(tok ?? null));
  }, [ready, wallet, getAccessToken]);

  const { isAdmin, loading: adminLoading } = useAdminRole();

  const refetch = useCallback(() => {
    fetch('/api/legal').then(r => r.json()).then(d => setDocs({ terms: d.terms ?? null, privacy: d.privacy ?? null, acceptable_use: d.acceptable_use ?? null, seller_agreement: d.seller_agreement ?? null })).catch(() => {});
  }, []);
  useEffect(() => { refetch(); }, [refetch]);

  if (ready && !adminLoading && !isAdmin) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[3], padding: S[5] }}>
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p style={{ ...t('heading'), color: T.textMuted, margin: 0 }}>Not authorized</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ ...glass({ strong: true, radius: 0 }), position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid var(--divider)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Legal Documents</div>
          <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 120 }}>
        <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[5], lineHeight: 1.6 }}>
          Upload the finalized Terms of Service, Privacy Policy, Acceptable Use Policy, and Seller Agreement as PDFs. They publish immediately to{' '}
          <Link href="/legal/terms" style={{ color: 'var(--text-strong)', textDecoration: 'underline' }}>/legal/terms</Link>,{' '}
          <Link href="/legal/privacy" style={{ color: 'var(--text-strong)', textDecoration: 'underline' }}>/legal/privacy</Link>,{' '}
          <Link href="/legal/acceptable-use" style={{ color: 'var(--text-strong)', textDecoration: 'underline' }}>/legal/acceptable-use</Link>, and{' '}
          <Link href="/legal/seller-agreement" style={{ color: 'var(--text-strong)', textDecoration: 'underline' }}>/legal/seller-agreement</Link>.
        </div>
        <UploadRow kind="terms" label="Terms of Service" current={docs.terms} wallet={wallet} token={token} onDone={refetch} />
        <UploadRow kind="privacy" label="Privacy Policy" current={docs.privacy} wallet={wallet} token={token} onDone={refetch} />
        <UploadRow kind="acceptable_use" label="Acceptable Use Policy" current={docs.acceptable_use} wallet={wallet} token={token} onDone={refetch} />
        <UploadRow kind="seller_agreement" label="Seller Agreement" current={docs.seller_agreement} wallet={wallet} token={token} onDone={refetch} />
      </div>
    </div>
  );
}
