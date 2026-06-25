'use client';

import { useEffect, useSyncExternalStore } from 'react';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'] as const;
export type Currency = typeof CURRENCIES[number];

const SYMBOLS: Record<Currency, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$',
};

// USDC (≈ USD) → target. Static reference rates; display only — settlement is always USDC/SOL.
const RATES: Record<Currency, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, AUD: 1.53, CAD: 1.36,
};

const STORAGE_KEY = 'visby-currency';

// Module-level store so every useCurrency() consumer stays in sync the instant the
// selection changes anywhere (e.g. the wallet page), without a Provider in the tree.
let current: Currency = 'USD';
let hydrated = false;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function getSnapshot(): Currency { return current; }
function getServerSnapshot(): Currency { return 'USD'; }

export function setCurrency(c: Currency) {
  if (c === current) return;
  current = c;
  try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  emit();
}

export function formatCurrency(usdcAmount: number, c: Currency = current): string {
  const v = usdcAmount * RATES[c];
  if (c === 'JPY') return `${SYMBOLS[c]}${Math.round(v).toLocaleString()}`;
  return `${SYMBOLS[c]}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function useCurrency() {
  const currency = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Hydrate once from localStorage after mount (kept out of the first render to avoid
  // an SSR/CSR mismatch), and keep in sync across tabs.
  useEffect(() => {
    if (!hydrated) {
      hydrated = true;
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as Currency | null;
        if (stored && CURRENCIES.includes(stored) && stored !== current) {
          current = stored;
          emit();
        }
      } catch {}
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue && CURRENCIES.includes(e.newValue as Currency)) {
          current = e.newValue as Currency;
          emit();
        }
      });
    }
  }, []);

  return {
    currency,
    setCurrency,
    format: (usdcAmount: number) => formatCurrency(usdcAmount, currency),
    symbol: SYMBOLS[currency],
  };
}
