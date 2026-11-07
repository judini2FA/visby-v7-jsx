'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { t, S, T, btn } from '@/lib/ui';
import { vendorAllowed } from '@/lib/links-hub';

const CONSENT_KEY = 'vby-hub-consent';
const GOOGLE_KEY = 'vby-hub-google';
const PRELAUNCH_CODE_KEY = 'visby-prelaunch-code';

const MODE = process.env.NEXT_PUBLIC_LINKS_CONSENT === 'opt_in' ? 'opt_in' : 'notice';
const RB2B_SRC = process.env.NEXT_PUBLIC_RB2B_SCRIPT_SRC;
const WARMLY_ID = process.env.NEXT_PUBLIC_WARMLY_CLIENT_ID;
const GOOGLE_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const HAS_VENDORS = !!(RB2B_SRC || WARMLY_ID);

type Choice = 'accepted' | 'declined' | null;

// Effects mount twice under React StrictMode (dev); one page load must still be one visit.
let visitSent = false;

type GoogleId = {
  initialize(o: Record<string, unknown>): void;
  prompt(): void;
};

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

function addScript(src: string, attrs: Record<string, string> = {}, onload?: () => void) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  if (onload) s.onload = onload;
  document.head.appendChild(s);
}

function beacon(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.('/api/links/track', new Blob([body], { type: 'application/json' }))) return;
  } catch {}
  fetch('/api/links/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

function sendConsent(choice: 'accepted' | 'declined' | 'gpc') {
  fetch('/api/links/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice }) }).catch(() => {});
}

function loadOneTap(onName: (n: string | null) => void) {
  addScript('https://accounts.google.com/gsi/client', {}, () => {
    const g = (window as unknown as { google?: { accounts?: { id?: GoogleId } } }).google?.accounts?.id;
    if (!g) return;
    g.initialize({
      client_id: GOOGLE_ID,
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
      use_fedcm_for_prompt: true,
      context: 'use',
      callback: async ({ credential }: { credential: string }) => {
        const res = await fetch('/api/links/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) }).catch(() => null);
        if (!res?.ok) return;
        write(GOOGLE_KEY, '1');
        const d = await res.json().catch(() => ({}));
        onName(d.name ?? null);
      },
    });
    g.prompt();
  });
}

// Observes the hub; never blocks or intercepts navigation. Every network call here is fire-and-forget.
export function HubTracker() {
  const [choice, setChoice] = useState<Choice>(null);
  const [gpc, setGpc] = useState(false);
  const [ready, setReady] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    const isGpc = nav.globalPrivacyControl === true;
    const dnt = nav.doNotTrack === '1';
    const stored = read(CONSENT_KEY);
    const c: Choice = stored === 'accepted' || stored === 'declined' ? stored : null;
    setChoice(c);
    setGpc(isGpc || dnt);
    setReady(true);

    const invite = url.searchParams.get('i');
    if (invite) {
      url.searchParams.delete('i');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    const allowVendors = vendorAllowed({ gpc: isGpc, dnt, choice: c, mode: MODE });
    if (!visitSent) beacon({
      type: 'visit',
      c: url.searchParams.get('c'),
      i: invite,
      pl: read(PRELAUNCH_CODE_KEY),
      ref: document.referrer || null,
      vo: HAS_VENDORS && !allowVendors,
    });
    visitSent = true;
    if (isGpc && !read('vby-hub-gpc-sent')) { write('vby-hub-gpc-sent', '1'); setTimeout(() => sendConsent('gpc'), 1500); }

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[data-link-id]');
      if (a) beacon({ type: 'click', link: a.getAttribute('data-link-id') });
    };
    const root = document.getElementById('hub-links');
    root?.addEventListener('click', onClick);
    root?.addEventListener('auxclick', onClick);

    const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(fn) : setTimeout(fn, 1200));
    idle(() => {
      if (allowVendors) {
        if (RB2B_SRC) addScript(RB2B_SRC);
        if (WARMLY_ID) addScript(`https://opps-widget.getwarmly.com/warmly.js?clientId=${encodeURIComponent(WARMLY_ID)}`, { id: 'warmly-script-loader', defer: '' });
      }
      if (GOOGLE_ID && c !== 'declined' && !read(GOOGLE_KEY)) loadOneTap(n => setGreeting(n ? `Thanks, ${n}.` : 'Thanks.'));
    });

    return () => {
      root?.removeEventListener('click', onClick);
      root?.removeEventListener('auxclick', onClick);
    };
  }, []);

  function decide(next: 'accepted' | 'declined') {
    write(CONSENT_KEY, next);
    sendConsent(next);
    setChoice(next);
    // Scripts already on the page can't be unloaded; a reload is the only clean stop.
    if (next === 'declined' && MODE === 'notice') window.location.reload();
    if (next === 'accepted') window.location.reload();
  }

  if (!ready) return null;
  const line = { ...t('micro'), color: T.textMuted, margin: 0, maxWidth: 400, textAlign: 'center' as const };

  return (
    <div style={{ marginTop: S[5], display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2] }}>
      {greeting && <p role="status" style={{ ...t('meta'), color: T.textMuted, margin: 0 }}>{greeting}</p>}
      {HAS_VENDORS && !gpc && choice === null && MODE === 'opt_in' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[1] }}>
          <p style={line}>Allow analytics that may identify your business profile to Visby?</p>
          <div style={{ display: 'flex', gap: S[1] }}>
            <button type="button" onClick={() => decide('accepted')} style={btn('text')}>Allow</button>
            <button type="button" onClick={() => decide('declined')} style={btn('text')}>No thanks</button>
          </div>
        </div>
      )}
      {HAS_VENDORS && !gpc && choice !== 'declined' && MODE === 'notice' && (
        <p style={line}>
          This page uses analytics, including third-party tools that may identify your business profile.{' '}
          <button type="button" onClick={() => decide('declined')} style={{ ...btn('text'), ...t('micro'), padding: 0, textDecoration: 'underline' }}>Opt out</button>
        </p>
      )}
      {HAS_VENDORS && (gpc || choice === 'declined') && <p style={line}>Third-party identification is off for this browser.</p>}
      <Link href="/legal/privacy" style={{ ...t('micro'), color: T.textMuted, textDecoration: 'underline', textUnderlineOffset: 3 }}>Privacy</Link>
    </div>
  );
}
