'use client';

import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { useCurrency, CURRENCIES, type Currency } from '@/lib/currency';
import { trpc } from '@/lib/trpc/client';

// Keeps the chosen display currency on the user's PROFILE (server), not just localStorage — so it survives
// an app update / reinstall / a different device. Adopts the saved value once on sign-in, then persists any
// later change. Mounted globally in providers.
export function CurrencySync() {
  const { ready, authenticated } = usePrivy();
  const { address } = useVisbWallet();
  const { currency, setCurrency } = useCurrency();
  const upsert = trpc.profiles.upsertProfile.useMutation();
  const adopted = useRef(false);
  const lastSaved = useRef<string | null>(null);

  const profileQ = trpc.profiles.getProfile.useQuery(
    { wallet: address },
    { enabled: ready && authenticated && !!address },
  );

  // Adopt the server's saved currency exactly once.
  useEffect(() => {
    if (adopted.current || !profileQ.isFetched) return;
    adopted.current = true;
    const saved = (profileQ.data as any)?.preferred_currency as string | undefined;
    if (saved && (CURRENCIES as readonly string[]).includes(saved)) {
      lastSaved.current = saved;
      if (saved !== currency) setCurrency(saved as Currency);
    } else {
      lastSaved.current = currency; // nothing saved yet — treat the current choice as the baseline
    }
  }, [profileQ.isFetched, profileQ.data, currency, setCurrency]);

  // Persist later user changes (skip the initial adopt + anything before we know the baseline).
  useEffect(() => {
    if (!adopted.current || !address || currency === lastSaved.current) return;
    lastSaved.current = currency;
    upsert.mutate({ wallet: address, preferred_currency: currency });
  }, [currency, address, upsert]);

  return null;
}
