'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { t, S, card, surface, btn } from '@/lib/ui';
import { HeaderMenu } from '@/components/layout/header-menu';

const C = {
  green: 'var(--ok)', red: 'var(--danger)',
};

function CheckoutSuccessInner() {
  const params    = useSearchParams();
  const sessionId = params.get('session_id');

  const [status,   setStatus]   = useState<'loading' | 'ok' | 'error'>('loading');
  const [itemName, setItemName] = useState('');
  const [itemId,   setItemId]   = useState('');
  const [errMsg,   setErrMsg]   = useState('');

  useEffect(() => {
    if (!sessionId) { setErrMsg('No session ID found.'); setStatus('error'); return; }

    fetch('/api/stripe/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setItemName(data.name ?? '');
          setItemId(data.item_id ?? '');
          setStatus('ok');
        } else {
          setErrMsg(data.error ?? 'Transfer failed.');
          setStatus('error');
        }
      })
      .catch(() => { setErrMsg('Network error.'); setStatus('error'); });
  }, [sessionId]);

  return (
    <div style={{ position: 'relative', background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: S[5] }}>

      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 50 }}>
        <HeaderMenu />
      </div>

      {status === 'loading' && (
        <>
          <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid var(--text-muted)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite', marginBottom: S[5] }} />
          <div style={{ ...t('heading'), color: 'var(--text)' }}>Confirming payment…</div>
        </>
      )}

      {status === 'ok' && (
        <div style={{ ...card(), width: '100%', maxWidth: 380, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[4] }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${C.green}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2], textAlign: 'center' }}>
            <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Payment Complete</div>
            <div style={{ ...t('body'), color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.6 }}>
              {itemName ? `You now own "${itemName}".` : 'Your item is yours.'}
            </div>
          </div>

          <div style={{ ...surface(), width: '100%', display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Payment</span>
              <span style={{ ...t('meta'), color: C.green }}>Confirmed</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Method</span>
              <span style={{ ...t('meta'), color: 'var(--text-strong)' }}>Card via Stripe</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: S[3], width: '100%' }}>
            {itemId && (
              <Link href={`/item/${itemId}`} style={{ ...btn('primary', { full: true }), textDecoration: 'none', textAlign: 'center' }}>
                View Item
              </Link>
            )}
            <Link href="/marketplace" style={{ ...btn('secondary', { full: true }), textDecoration: 'none', textAlign: 'center' }}>
              Marketplace
            </Link>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ ...card(), width: '100%', maxWidth: 380, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[4] }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--danger-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2], textAlign: 'center' }}>
            <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Something went wrong</div>
            <div style={{ ...t('body'), color: 'var(--text-muted)', maxWidth: 300 }}>{errMsg}</div>
          </div>
          <Link href="/marketplace" style={{ ...btn('primary', { full: true }), textDecoration: 'none', textAlign: 'center' }}>
            Back to Marketplace
          </Link>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div style={{ background: 'transparent', minHeight: '100vh' }} />}>
      <CheckoutSuccessInner />
    </Suspense>
  );
}
