'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { card, btn, t, S, T } from '@/lib/ui';

export default function LoginPage() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) router.push('/dashboard');
  }, [ready, authenticated, router]);

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: S[5] }}>

      <div style={{ ...card(), width: '100%', maxWidth: 420, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Logo (frozen) */}
        <img src="/visby-logo.png" alt="Visby" style={{ width: 96, height: 'auto', marginBottom: S[4] }} />
        <svg width="120" height="36" viewBox="0 0 120 36">
          <defs>
            <linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#25CDB8" />
              <stop offset="50%"  stopColor="#2A8AED" />
              <stop offset="100%" stopColor="#BC2DE6"  />
            </linearGradient>
          </defs>
          <text x="60" y="30" textAnchor="middle" fontFamily="'Quicksand',sans-serif" fontSize="32" fontWeight="400" fill="url(#vg)" letterSpacing="-1">Visby</text>
        </svg>

        <div style={{ ...t('title'), color: T.textStrong, marginTop: S[5], textAlign: 'center' }}>Welcome</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], marginBottom: S[6], textAlign: 'center', maxWidth: 320 }}>
          Sign in with your email. We'll create a secure wallet automatically — no crypto knowledge needed.
        </div>

        <button onClick={login} disabled={!ready} style={{ ...btn('primary', { full: true }), opacity: ready ? 1 : 0.6, cursor: ready ? 'pointer' : 'not-allowed' }}>
          {!ready ? 'Loading…' : 'Sign in with Visby'}
        </button>

        <div style={{ ...t('meta'), color: T.textMuted, marginTop: S[5], textAlign: 'center', lineHeight: 1.6 }}>
          By signing in you agree to our Terms of Service.
        </div>
      </div>
    </div>
  );
}
