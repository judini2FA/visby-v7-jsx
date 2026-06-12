'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

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
    <div style={{ background: C.navy, minHeight: '100vh', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>

      {status === 'loading' && (
        <>
          <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid var(--text-muted)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite', marginBottom: 20 }} />
          <div style={{ fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>Confirming payment…</div>
          <div style={{ fontSize: 12, color: C.muted }}>Transferring NFT provenance on Solana</div>
        </>
      )}

      {status === 'ok' && (
        <>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${C.green}20`, border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>

          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8, textAlign: 'center' }}>
            Payment Complete!
          </div>
          <div style={{ fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 300, marginBottom: 32, lineHeight: 1.6 }}>
            {itemName ? `You now own "${itemName}".` : 'Your item is yours.'}{' '}
            Ownership has been transferred on Solana.
          </div>

          <div style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 24, boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: '18px 20px', width: '100%', maxWidth: 360, marginBottom: 28 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Manrope',sans-serif" }}>Payment</span>
                <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>Confirmed ✓</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Manrope',sans-serif" }}>Method</span>
                <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 600 }}>Card via Stripe</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Manrope',sans-serif" }}>NFT Transfer</span>
                <span style={{ fontSize: 12, color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif" }}>Solana devnet ✓</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 360 }}>
            {itemId && (
              <Link href={`/item/${itemId}`} style={{ flex: 1, background: GH, borderRadius: 22, padding: '14px', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', textAlign: 'center' }}>
                View Item
              </Link>
            )}
            <Link href="/marketplace" style={{ flex: 1, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', borderRadius: 22, padding: '14px', color: 'var(--text-strong)', fontWeight: 600, fontSize: 14, textDecoration: 'none', textAlign: 'center' }}>
              Marketplace
            </Link>
          </div>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,59,92,.1)', border: '2px solid rgba(255,59,92,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 28, textAlign: 'center', maxWidth: 300 }}>{errMsg}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/marketplace" style={{ background: GH, borderRadius: 22, padding: '12px 28px', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Back to Marketplace
            </Link>
          </div>
        </>
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
