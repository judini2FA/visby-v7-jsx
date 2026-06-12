'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

export default function LoginPage() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) router.push('/dashboard');
  }, [ready, authenticated, router]);

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: "'Manrope',sans-serif" }}>

      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
        <img src="/visby-logo.png" alt="Visby" style={{ width: 120, height: 'auto', marginBottom: 14 }} />
        <svg width="120" height="36" viewBox="0 0 120 36">
          <defs>
            <linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={C.cyan} />
              <stop offset="50%"  stopColor={C.blue} />
              <stop offset="100%" stopColor={C.mag}  />
            </linearGradient>
          </defs>
          <text x="60" y="30" textAnchor="middle" fontFamily="'Quicksand',sans-serif" fontSize="32" fontWeight="400" fill="url(#vg)" letterSpacing="-1">Visby</text>
        </svg>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.04em' }}>Fraud-free NFT provenance</div>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-lg)', padding: '32px 24px', boxShadow: 'var(--glass-shadow), var(--glass-inner)' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8 }}>Welcome</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6 }}>
          Sign in with your email. We'll create a secure wallet automatically — no crypto knowledge needed.
        </div>

        <button onClick={login} disabled={!ready}
          style={{ width: '100%', background: !ready ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 'var(--r-sm)', padding: '15px 20px', fontWeight: 700, fontSize: 16, color: !ready ? 'var(--text-muted)' : '#fff', cursor: !ready ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand', sans-serif", boxShadow: !ready ? 'none' : '0 2px 16px rgba(0,0,0,.4)' }}>
          {!ready ? 'Loading…' : 'Sign in with Visby'}
        </button>

        {/* Trust signals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {([
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, text: 'Bank-grade MPC wallet security' },
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, text: 'NFT ownership verified on Solana' },
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>, text: 'No seed phrase to lose or manage' },
          ] as const).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {s.icon}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 24, textAlign: 'center', lineHeight: 1.7 }}>
        By signing in you agree to our Terms of Service.<br/>Your wallet is created and secured automatically.
      </div>
    </div>
  );
}
