'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { t, S, T, card, btn, input } from '@/lib/ui';
import { PRELAUNCH_INTERESTS, REFERRAL_BOOST, type PrelaunchStanding } from '@/lib/prelaunch-shared';
import { PrelaunchWordmark } from './wordmark';

const STORE_KEY = 'visby-prelaunch-code';

function PrelaunchInner() {
  const params = useSearchParams();
  const ref = params.get('ref');

  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standing, setStanding] = useState<PrelaunchStanding | null>(null);
  const [already, setAlready] = useState(false);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let code: string | null = null;
    try { code = localStorage.getItem(STORE_KEY); } catch {}
    fetch(`/api/prelaunch/status${code ? `?code=${encodeURIComponent(code)}` : ''}`)
      .then(r => r.json())
      .then(d => {
        setWaiting(d.waiting ?? null);
        if (d.standing) { setStanding(d.standing); setInterests(d.standing.interests ?? []); }
      })
      .catch(() => {});
  }, []);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/prelaunch/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, company, ref, source: document.referrer || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'Something went wrong. Please try again.'); return; }
      if (d.standing) {
        setStanding(d.standing);
        setInterests(d.standing.interests ?? []);
        setAlready(!!d.already);
        try { localStorage.setItem(STORE_KEY, d.standing.refCode); } catch {}
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function toggleInterest(id: string) {
    if (!standing) return;
    const next = interests.includes(id) ? interests.filter(i => i !== id) : [...interests, id];
    setInterests(next);
    fetch('/api/prelaunch/interests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: standing.refCode, interests: next }),
    }).catch(() => {});
  }

  const shareUrl = standing ? `${typeof window !== 'undefined' ? window.location.origin : ''}/prelaunch?ref=${standing.refCode}` : '';

  async function share() {
    const data = { title: 'Visby', text: 'Join me on the Visby prelaunch', url: shareUrl };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch { return; }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div style={{ background: 'transparent', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${S[7]}px ${S[4]}px` }}>
      <div style={{ ...card(), width: '100%', maxWidth: 440, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <PrelaunchWordmark />

        {!standing ? (
          <>
            <h1 style={{ ...t('title'), color: T.textStrong, margin: `${S[5]}px 0 0` }}>Luxury you can verify</h1>
            <p style={{ ...t('body'), color: T.textMuted, margin: `${S[2]}px 0 ${S[5]}px`, maxWidth: 340 }}>
              Visby is a marketplace for sneakers, watches, bags and more, where every item carries a verified ownership history. Join the prelaunch for early access.
            </p>

            <form onSubmit={join} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: S[3] }}>
              <label htmlFor="pl-email" style={{ position: 'absolute', left: -9999 }}>Email address</label>
              <input
                id="pl-email" type="email" required autoComplete="email" inputMode="email"
                placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)}
                style={input()}
              />
              <input
                tabIndex={-1} autoComplete="off" aria-hidden="true" name="company"
                value={company} onChange={e => setCompany(e.target.value)}
                style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
              />
              <button type="submit" disabled={busy} style={{ ...btn('primary', { full: true }), opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Joining…' : 'Join the prelaunch'}
              </button>
              {error && <p role="alert" style={{ ...t('meta'), color: 'var(--danger)', margin: 0 }}>{error}</p>}
            </form>

            {waiting != null && (
              <p style={{ ...t('meta'), color: T.textMuted, margin: `${S[4]}px 0 0` }}>
                {waiting.toLocaleString()} people waiting
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ ...t('micro'), color: T.textMuted, margin: `${S[5]}px 0 0` }}>{already ? 'Welcome back' : "You're on the list"}</p>
            <div style={{ ...t('display'), color: T.textStrong, margin: `${S[2]}px 0 0` }}>#{standing.position.toLocaleString()}</div>
            <p style={{ ...t('body'), color: T.textMuted, margin: `${S[2]}px 0 0`, maxWidth: 340 }}>
              Share your link. Each friend who joins moves you up {REFERRAL_BOOST} spots.
              {standing.referrals > 0 && ` You've referred ${standing.referrals} so far.`}
            </p>

            <div style={{ width: '100%', display: 'flex', gap: S[2], marginTop: S[4] }}>
              <input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} aria-label="Your referral link" style={{ ...input(), ...t('meta'), flex: 1, minWidth: 0 }} />
              <button type="button" onClick={share} style={btn('primary')}>{copied ? 'Copied' : 'Share'}</button>
            </div>

            <div style={{ width: '100%', marginTop: S[6] }}>
              <p style={{ ...t('heading'), color: T.textStrong, margin: 0 }}>What are you into?</p>
              <p style={{ ...t('meta'), color: T.textMuted, margin: `${S[1]}px 0 ${S[3]}px` }}>Tap any that apply. It helps us pick what launches first.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2], justifyContent: 'center' }}>
                {PRELAUNCH_INTERESTS.map(i => {
                  const on = interests.includes(i.id);
                  return (
                    <button key={i.id} type="button" aria-pressed={on} onClick={() => toggleInterest(i.id)} style={btn(on ? 'primary' : 'secondary')}>
                      {i.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <Link href="/prelaunch/investors" style={{ ...t('meta'), color: T.textMuted, marginTop: S[5], textDecoration: 'underline', textUnderlineOffset: 3 }}>
        Questions about investing?
      </Link>
    </div>
  );
}

export default function PrelaunchPage() {
  return (
    <Suspense fallback={null}>
      <PrelaunchInner />
    </Suspense>
  );
}
