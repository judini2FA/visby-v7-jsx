'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { t, S, T, surface, sheet, btn, input } from '@/lib/ui';

export type GatedDoc = { id: string; label: string; description?: string };

const STORE_KEY = 'vby-hub-requester';

type Requester = { email: string; student: boolean };

function readRequester(): Requester | null {
  try {
    const r = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    return r && typeof r.email === 'string' ? { email: r.email, student: !!r.student } : null;
  } catch { return null; }
}

async function request(doc: string, r: Requester, company = ''): Promise<{ href: string | null } | { error: string }> {
  try {
    const res = await fetch('/api/links/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc, email: r.email, student: r.student, company }),
    });
    const d = await res.json().catch(() => ({}));
    return res.ok ? { href: d.href ?? null } : { error: d.error ?? 'Something went wrong. Please try again.' };
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

const chevron = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// Rows for the gated documents plus the email sheet in front of them. A visitor who already gave an
// email on this device goes straight through; their request is still recorded each time.
export function DocGate({ docs }: { docs: GatedDoc[] }) {
  const [open, setOpen] = useState<GatedDoc | null>(null);
  const [email, setEmail] = useState('');
  const [student, setStudent] = useState(false);
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ href: string | null } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !done) emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, done]);

  function close() {
    setOpen(null); setDone(null); setError(null);
  }

  async function pick(doc: GatedDoc) {
    const known = readRequester();
    if (!known) {
      setEmail(''); setStudent(false); setOpen(doc);
      return;
    }
    setBusy(doc.id);
    const r = await request(doc.id, known);
    setBusy(null);
    if ('href' in r && r.href) { window.location.href = r.href; return; }
    setEmail(known.email); setStudent(known.student); setOpen(doc);
    if ('href' in r) setDone(r); else setError(r.error);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    setBusy(open.id); setError(null);
    const who = { email: email.trim(), student };
    const r = await request(open.id, who, company);
    setBusy(null);
    if ('error' in r) { setError(r.error); return; }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(who)); } catch {}
    setDone(r);
  }

  const row: CSSProperties = {
    ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', alignItems: 'center', gap: S[3], minHeight: 56,
    width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit',
  };

  return (
    <>
      {docs.map(doc => (
        <button key={doc.id} type="button" data-link-id={doc.id} onClick={() => pick(doc)} disabled={busy === doc.id} style={row}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
            <span style={{ ...t('heading'), color: T.textStrong }}>{doc.label}</span>
            {doc.description && <span style={{ ...t('meta'), color: T.textMuted }}>{doc.description}</span>}
          </span>
          <span style={{ color: T.textMuted, display: 'flex' }}>{busy === doc.id ? <span style={t('meta')}>Opening…</span> : chevron}</span>
        </button>
      ))}

      {/* Portaled: the hub card's backdrop-filter would otherwise become the containing block for this
          position:fixed overlay and trap it inside the card. */}
      {open && createPortal(
        <div role="presentation" onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10, 8, 16, .45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: S[4] }}>
          <div role="dialog" aria-modal="true" aria-labelledby="gate-title" onClick={e => e.stopPropagation()}
            style={{ ...sheet(), width: '100%', maxWidth: 420, padding: S[5], marginBottom: 'env(safe-area-inset-bottom)', textAlign: 'left' }}>
            {!done ? (
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <h2 id="gate-title" style={{ ...t('heading'), color: T.textStrong, margin: 0 }}>{open.label}</h2>
                <p style={{ ...t('body'), color: T.textMuted, margin: 0 }}>Enter your email to get your free copy.</p>
                <label htmlFor="gate-email" style={{ position: 'absolute', left: -9999 }}>Email address</label>
                <input ref={emailRef} id="gate-email" type="email" required autoComplete="email" inputMode="email"
                  placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} style={input()} />
                <input tabIndex={-1} autoComplete="off" aria-hidden="true" name="company" value={company} onChange={e => setCompany(e.target.value)}
                  style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: S[2], ...t('body'), color: T.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={student} onChange={e => setStudent(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#2A8AED' }} />
                  I&apos;m a student
                </label>
                <button type="submit" disabled={!!busy} style={{ ...btn('primary', { full: true }), opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'One moment…' : 'Get free copy'}
                </button>
                {error && <p role="alert" style={{ ...t('meta'), color: 'var(--danger)', margin: 0 }}>{error}</p>}
                <button type="button" onClick={close} style={{ ...btn('text'), alignSelf: 'center' }}>Cancel</button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <h2 id="gate-title" style={{ ...t('heading'), color: T.textStrong, margin: 0 }}>Thanks!</h2>
                {done.href ? (
                  <a href={done.href} target="_blank" rel="noopener noreferrer" style={btn('primary', { full: true })}>Open {open.label.replace(/^Get free copy of /, '')}</a>
                ) : (
                  <p style={{ ...t('body'), color: T.textMuted, margin: 0 }}>
                    The {open.label.replace(/^Get free copy of /, '')} is being finalized. We&apos;ll send a copy to {email.trim() || 'your email'} as soon as it&apos;s ready.
                  </p>
                )}
                {error && <p role="alert" style={{ ...t('meta'), color: 'var(--danger)', margin: 0 }}>{error}</p>}
                <button type="button" onClick={close} style={{ ...btn('text'), alignSelf: 'center' }}>Close</button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
