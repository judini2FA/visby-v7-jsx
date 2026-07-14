'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { btn, S } from '@/lib/ui';

// Gated behind NEXT_PUBLIC_MOOV_ENABLED — off until Moov is the live card rail (capabilities enabled +
// webhook secret in). Collects a card via Moov's Card Link Drop: raw PAN goes straight to Moov's vault,
// never our server. onCardID fires with (accountID, cardID); the server turns that into a charge.
export const MOOV_ENABLED = process.env.NEXT_PUBLIC_MOOV_ENABLED === '1';

export function MoovCardForm({
  buyerWallet,
  onCardID,
  onError,
}: {
  // Optional: when present, /api/moov/card-token reuses this wallet's existing Moov account (if any
  // card is already on file) instead of provisioning a fresh anonymous one for every new card added.
  buyerWallet?: string;
  onCardID: (accountID: string, cardID: string) => void;
  onError?: (msg: string) => void;
}) {
  const { getAccessToken } = usePrivy();
  const ref = useRef<any>(null);
  const accountRef = useRef<string>('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!MOOV_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/moov/card-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ wallet: buyerWallet ?? null }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? 'card token failed');
        await import('@moovio/moov-js'); // registers the <moov-card-link> custom element
        if (cancelled) return;
        accountRef.current = d.accountID;
        const el = ref.current;
        if (el) {
          // Function/object props must be set on the element, not as JSX string attributes.
          el.oauthToken = d.token;
          el.accountID = d.accountID;
          el.onSuccess = (result: any) => onCardID(accountRef.current, result?.cardID);
          el.onError = (_clientError: any, apiError: any) => onError?.(apiError?.error ?? 'Card error');
          setReady(true);
        }
      } catch (e: any) {
        onError?.(e?.message ?? 'Could not start card entry');
      }
    })();
    return () => { cancelled = true; };
  }, [getAccessToken, buyerWallet, onCardID, onError]);

  if (!MOOV_ENABLED) return null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); setBusy(true); try { ref.current?.submit?.(); } finally { setBusy(false); } }}>
      {/* @ts-expect-error moov-card-link is a runtime-registered custom element */}
      <moov-card-link ref={ref}></moov-card-link>
      <button type="submit" disabled={!ready || busy} style={{ ...btn('primary', { full: true }), marginTop: S[3] }}>
        {busy ? 'Saving…' : 'Save card'}
      </button>
    </form>
  );
}
