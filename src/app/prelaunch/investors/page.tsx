'use client';

import { useState } from 'react';
import Link from 'next/link';
import { t, S, T, card, btn, input } from '@/lib/ui';
import { PrelaunchWordmark } from '../wordmark';

export default function InvestorsPage() {
  const [form, setForm] = useState({ name: '', email: '', firm: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/prelaunch/investor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'Something went wrong. Please try again.'); return; }
      setSent(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const label = { ...t('meta'), color: T.textMuted, fontWeight: 600, display: 'block', marginBottom: S[1], textAlign: 'left' } as const;

  return (
    <div style={{ background: 'transparent', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${S[7]}px ${S[4]}px` }}>
      <div style={{ ...card(), width: '100%', maxWidth: 480, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <PrelaunchWordmark />

        {sent ? (
          <>
            <h1 style={{ ...t('title'), color: T.textStrong, margin: `${S[5]}px 0 0` }}>Message sent</h1>
            <p style={{ ...t('body'), color: T.textMuted, margin: `${S[2]}px 0 0`, maxWidth: 340 }}>
              Thanks for reaching out. Judah will reply to {form.email} directly.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ ...t('title'), color: T.textStrong, margin: `${S[5]}px 0 0` }}>Investing in Visby</h1>
            <p style={{ ...t('body'), color: T.textMuted, margin: `${S[2]}px 0 ${S[5]}px`, maxWidth: 360 }}>
              Send a note to Judah, Visby&apos;s founder. You&apos;ll get a reply by email.
            </p>

            <form onSubmit={submit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: S[4] }}>
              <div>
                <label htmlFor="inv-name" style={label}>Name</label>
                <input id="inv-name" required autoComplete="name" value={form.name} onChange={set('name')} style={input()} />
              </div>
              <div>
                <label htmlFor="inv-email" style={label}>Email</label>
                <input id="inv-email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} style={input()} />
              </div>
              <div>
                <label htmlFor="inv-firm" style={label}>Firm or fund (optional)</label>
                <input id="inv-firm" autoComplete="organization" value={form.firm} onChange={set('firm')} style={input()} />
              </div>
              <div>
                <label htmlFor="inv-msg" style={label}>Message</label>
                <textarea id="inv-msg" required rows={5} value={form.message} onChange={set('message')} style={{ ...input(), resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <input
                tabIndex={-1} autoComplete="off" aria-hidden="true" name="website"
                value={form.website} onChange={set('website')}
                style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
              />
              <button type="submit" disabled={busy} style={{ ...btn('primary', { full: true }), opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Sending…' : 'Send message'}
              </button>
              {error && <p role="alert" style={{ ...t('meta'), color: 'var(--danger)', margin: 0 }}>{error}</p>}
            </form>
          </>
        )}
      </div>

      <Link href="/prelaunch" style={{ ...t('meta'), color: T.textMuted, marginTop: S[5], textDecoration: 'underline', textUnderlineOffset: 3 }}>
        Back to the prelaunch
      </Link>
    </div>
  );
}
