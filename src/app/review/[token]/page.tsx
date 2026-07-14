'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { StarRating } from '@/components/reviews';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, card, btn, input, T } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

interface Verified {
  order_id: string;
  buyer_wallet: string;
  item_id: string;
  product_name: string | null;
  status: string;
  existing: { rating: number; comment: string | null } | null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: S[5] }}>
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 50 }}><HeaderMenu /></div>
      <div style={{ width: '100%', maxWidth: 460 }}>{children}</div>
    </div>
  );
}

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const { login, authenticated, getAccessToken } = usePrivy();
  const { address: wallet } = useVisbWallet();

  const [state, setState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [data, setData] = useState<Verified | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/reviews/verify?token=${encodeURIComponent(token)}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) { setErrMsg(body.error ?? 'This review link is invalid.'); setState('invalid'); return; }
        setData(body);
        if (body.existing) { setRating(body.existing.rating ?? 0); setComment(body.existing.comment ?? ''); }
        setState('ready');
      })
      .catch(() => { setErrMsg('Could not load this review link.'); setState('invalid'); });
  }, [token]);

  const isBuyer = !!wallet && !!data && wallet === data.buyer_wallet;

  async function submit() {
    if (!data || rating === 0 || busy) return;
    setBusy(true); setSubmitErr('');
    try {
      const tok = await getAccessToken();
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ reviewer_wallet: data.buyer_wallet, order_id: data.order_id, rating, comment: comment.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as any).error ?? 'Could not submit your review.');
      setDone(true);
    } catch (e: any) {
      setSubmitErr(friendlyError(e, 'Could not submit your review — try again.'));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return (
      <Centered>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid var(--text-muted)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite', margin: '0 auto' }} />
        </div>
      </Centered>
    );
  }

  if (state === 'invalid') {
    return (
      <Centered>
        <div style={{ ...card({ pad: S[5] }), textAlign: 'center', display: 'flex', flexDirection: 'column', gap: S[3], alignItems: 'center' }}>
          <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ ...t('heading'), color: T.textStrong }}>{errMsg}</span>
          <Link href="/" style={{ ...btn('secondary'), textDecoration: 'none' }}>Go to Visby</Link>
        </div>
      </Centered>
    );
  }

  const productName = data?.product_name || 'your Tally';

  return (
    <Centered>
      <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
        {done ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: S[3], alignItems: 'center', padding: `${S[3]}px 0` }}>
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span style={{ ...t('title'), color: T.textStrong }}>Thanks for your review</span>
            <span style={{ ...t('body'), color: T.textMuted }}>It helps other buyers shop with confidence.</span>
            <Link href={`/item/${data?.item_id}`} style={{ ...btn('secondary'), textDecoration: 'none' }}>View the item</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
              <span style={{ ...t('title'), color: T.textStrong }}>Rate your purchase</span>
              <span style={{ ...t('body'), color: T.textMuted }}>How was <strong style={{ color: 'var(--text)' }}>{productName}</strong>?</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', padding: `${S[2]}px 0` }}>
              <StarRating value={rating} size={34} onChange={(v) => setRating(v)} />
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder="Add a comment (optional)"
              style={{ ...input(), resize: 'vertical', minHeight: 84, fontFamily: 'inherit' }}
            />

            {submitErr && <span style={{ ...t('meta'), color: 'var(--danger)' }}>{submitErr}</span>}

            {isBuyer ? (
              <button onClick={submit} disabled={rating === 0 || busy} style={{ ...btn('primary', { full: true }), opacity: rating === 0 || busy ? 0.6 : 1 }}>
                {busy ? 'Submitting…' : data?.existing ? 'Update review' : 'Submit review'}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                <span style={{ ...t('meta'), color: T.textMuted, textAlign: 'center' }}>
                  {authenticated && wallet ? 'Sign in with the account that placed this order to submit.' : 'Sign in to submit your review.'}
                </span>
                <button onClick={login} style={{ ...btn('primary', { full: true }) }}>Sign in</button>
              </div>
            )}
          </>
        )}
      </div>
    </Centered>
  );
}
