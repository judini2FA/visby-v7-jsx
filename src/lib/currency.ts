'use client';

import { useState, useEffect } from 'react';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'] as const;
export type Currency = typeof CURRENCIES[number];

const SYMBOLS: Record<Currency, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$',
};

const RATES: Record<Currency, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, AUD: 1.53, CAD: 1.36,
};

export function useCurrency() {
  const [currency, setCurrencyState] = useState<Currency>('USD');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('visby-currency') as Currency | null;
      if (stored && CURRENCIES.includes(stored)) setCurrencyState(stored);
    } catch {}
  }, []);

  function setCurrency(c: Currency) {
    setCurrencyState(c);
    try { localStorage.setItem('visby-currency', c); } catch {}
  }

  function format(usdcAmount: number): string {
    const converted = usdcAmount * RATES[currency];
    if (currency === 'JPY') return `${SYMBOLS[currency]}${Math.round(converted).toLocaleString()}`;
    return `${SYMBOLS[currency]}${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return { currency, setCurrency, format, symbol: SYMBOLS[currency] };
}
