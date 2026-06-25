'use client';

import { useState, useEffect } from 'react';

// The buyer's default way to pay, set once in the Visby app and mirrored at checkout:
//   'wallet' → pay from their Visby (USDC) balance
//   'card'   → pay with their saved card (shown as •••• last4)
// Stored like the currency preference (localStorage) for now; moves to the profile row when we
// persist it server-side so it follows the user across devices.
export type PayMethod = 'wallet' | 'card';

const KEY = 'visby-default-payment';

export function useDefaultPayment() {
  const [method, setMethodState] = useState<PayMethod>('card');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === 'wallet' || stored === 'card') setMethodState(stored);
    } catch {}
  }, []);

  function setMethod(m: PayMethod) {
    setMethodState(m);
    try { localStorage.setItem(KEY, m); } catch {}
  }

  return { method, setMethod };
}
