'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { t, S, T } from '@/lib/ui';
import { beacon } from './beacon';

const PRELAUNCH_CODE_KEY = 'visby-prelaunch-code';

// Effects mount twice under React StrictMode (dev); one page load must still be one visit.
let visitSent = false;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

// Observes the hub; never blocks or intercepts navigation. Every network call here is fire-and-forget.
export function HubTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const invite = url.searchParams.get('i');
    if (invite) {
      url.searchParams.delete('i');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    if (!visitSent) {
      beacon({
        type: 'visit',
        c: url.searchParams.get('c'),
        i: invite,
        pl: read(PRELAUNCH_CODE_KEY),
        ref: document.referrer || null,
      });
      visitSent = true;
    }

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('[data-link-id]');
      if (a) beacon({ type: 'click', link: a.getAttribute('data-link-id') });
    };
    const root = document.getElementById('hub-links');
    root?.addEventListener('click', onClick);
    root?.addEventListener('auxclick', onClick);
    return () => {
      root?.removeEventListener('click', onClick);
      root?.removeEventListener('auxclick', onClick);
    };
  }, []);

  return (
    <div style={{ marginTop: S[5], display: 'flex', justifyContent: 'center' }}>
      <Link href="/legal/privacy" style={{ ...t('micro'), color: T.textMuted, textDecoration: 'underline', textUnderlineOffset: 3 }}>Privacy</Link>
    </div>
  );
}
