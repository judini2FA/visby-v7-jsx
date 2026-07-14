'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { trpc } from '@/lib/trpc/client';
import { OnboardingWizard } from '@/components/onboarding/wizard';

const LS_INTENT = 'visby-auth-intent';
const LS_ONBOARDED = 'visby-onboarded-v1';

function readIntent(): 'create' | 'signin' | null {
  try {
    const v = localStorage.getItem(LS_INTENT);
    return v === 'create' || v === 'signin' ? v : null;
  } catch {
    return null;
  }
}

function readOnboarded(): boolean {
  try {
    return localStorage.getItem(LS_ONBOARDED) === '1';
  } catch {
    return false;
  }
}

// Post-auth signup wizard gate. Trigger: Privy `ready && authenticated` AND (auth-intent was
// 'create' OR the signed-in wallet's profile has no username yet) — see readIntent/hasUsername
// below. Returning users (intent 'signin' with a profile that already has a username) fall
// straight through to `children`. Unauthenticated users always fall through, and once this
// device has finished/skipped the wizard (visby-onboarded-v1), it never shows again here.
//
// INVARIANT (kept from the prior stub): fail-open on any ambiguity (still loading, wallet not
// resolved yet, profile fetch failed) — render children rather than trap the user behind a gate
// that can't make up its mind.
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { address: wallet, ready: walletReady } = useVisbWallet();

  // Lazy-initialized synchronously so a brand-new "Create account" signup shows the wizard on
  // first paint instead of flashing the app first — this is the common path SU1 targets. The
  // signin-but-missing-username edge case still resolves async once the profile query settles.
  const [show, setShow] = useState<boolean>(() => !readOnboarded() && readIntent() === 'create');
  const decidedForWallet = useRef<string | null>(null);

  const profileQuery = trpc.profiles.getProfile.useQuery(
    { wallet },
    { enabled: ready && authenticated && walletReady && !!wallet, retry: 1 },
  );

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setShow(false);
      decidedForWallet.current = null;
      return;
    }
    if (readOnboarded()) {
      setShow(false);
      return;
    }
    if (!walletReady || !wallet) return; // wallet not resolved yet — don't decide prematurely
    if (decidedForWallet.current === wallet) return; // already decided this session
    if (profileQuery.isLoading) return; // wait for the first fetch to settle

    // Fail-open: a broken profile fetch must never force the gate shut.
    if (profileQuery.isError) {
      decidedForWallet.current = wallet;
      return;
    }

    const intent = readIntent();
    const hasUsername = !!(profileQuery.data as any)?.username;
    decidedForWallet.current = wallet;
    setShow(intent === 'create' || !hasUsername);
  }, [ready, authenticated, walletReady, wallet, profileQuery.isLoading, profileQuery.isError, profileQuery.data]);

  function finish() {
    try {
      localStorage.setItem(LS_ONBOARDED, '1');
      localStorage.removeItem(LS_INTENT);
    } catch {}
    setShow(false);
  }

  if (!ready || !authenticated) return <>{children}</>;
  if (show) return <OnboardingWizard wallet={wallet} onFinish={finish} />;
  return <>{children}</>;
}
