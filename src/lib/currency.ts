'use client';

import { useEffect, useSyncExternalStore } from 'react';

export const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'] as const;
export const CRYPTO_CURRENCIES = ['SOL', 'ETH', 'BTC'] as const;
export const CURRENCIES = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES] as const;
export type FiatCurrency = typeof FIAT_CURRENCIES[number];
export type CryptoCurrency = typeof CRYPTO_CURRENCIES[number];
export type Currency = typeof CURRENCIES[number];

export function isCrypto(c: Currency): c is CryptoCurrency {
  return (CRYPTO_CURRENCIES as readonly string[]).includes(c);
}

const SYMBOLS: Record<FiatCurrency, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$',
};

// USDC (≈ USD) → fiat. Static reference rates; display only — settlement is always USDC/SOL.
const RATES: Record<FiatCurrency, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, AUD: 1.53, CAD: 1.36,
};

// Display precision per coin.
const CRYPTO_DP: Record<CryptoCurrency, number> = { SOL: 4, ETH: 5, BTC: 6 };

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

// Live USD price per coin (CoinGecko-backed via /api/price/rates). Until the first load arrives, a crypto
// view falls back to USD so a price never renders blank.
let cryptoUsd: Partial<Record<CryptoCurrency, number>> = {};
let ratesFetchedAt = 0;
let ratesInFlight = false;
let refresherStarted = false;
const RATES_TTL_MS = 60_000; // matches the server-side /api/price/rates cache window

function loadCryptoRates() {
  if (ratesInFlight || typeof window === 'undefined') return;
  if (ratesFetchedAt && Date.now() - ratesFetchedAt < RATES_TTL_MS) return; // still fresh
  ratesInFlight = true;
  fetch('/api/price/rates')
    .then((r) => r.json())
    .then((j: { usd?: Record<string, number> }) => {
      if (j?.usd && typeof j.usd === 'object') {
        cryptoUsd = j.usd as Partial<Record<CryptoCurrency, number>>;
        ratesFetchedAt = Date.now();
        emit();
      }
    })
    .catch(() => {})
    .finally(() => { ratesInFlight = false; });
  ensureRefresher();
}

// A crypto price-view must stay current, not freeze at first load. While a crypto view is active,
// refresh on an interval and whenever the tab regains focus (rates can be minutes stale after the tab
// is backgrounded). One module-level refresher, not one per useCurrency() consumer.
function ensureRefresher() {
  if (refresherStarted || typeof window === 'undefined') return;
  refresherStarted = true;
  setInterval(() => { if (isCrypto(current)) loadCryptoRates(); }, RATES_TTL_MS);
  const refetchIfVisible = () => {
    if (document.visibilityState === 'visible' && isCrypto(current)) loadCryptoRates();
  };
  document.addEventListener('visibilitychange', refetchIfVisible);
  window.addEventListener('focus', refetchIfVisible);
}

export function setCurrency(c: Currency) {
  if (c === current) return;
  current = c;
  try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  if (isCrypto(c)) loadCryptoRates();
  emit();
}

export function formatCurrency(usdcAmount: number, c: Currency = current): string {
  if (isCrypto(c)) {
    const rate = cryptoUsd[c];
    if (!rate) return formatCurrency(usdcAmount, 'USD'); // rates not loaded yet → USD fallback
    const coin = usdcAmount / rate;
    return `${coin.toLocaleString('en-US', { maximumFractionDigits: CRYPTO_DP[c] })} ${c}`;
  }
  const f = c as FiatCurrency;
  const v = usdcAmount * RATES[f];
  if (f === 'JPY') return `${SYMBOLS[f]}${Math.round(v).toLocaleString()}`;
  return `${SYMBOLS[f]}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A fiat OR crypto amount the user typed → its USDC (≈ USD) value.
export function toUsdc(amount: number, c: Currency = current): number {
  if (isCrypto(c)) {
    const rate = cryptoUsd[c];
    return rate ? amount * rate : amount; // until rates load, best-effort 1:1
  }
  return amount / RATES[c as FiatCurrency];
}

function symbolFor(c: Currency): string {
  return isCrypto(c) ? c : SYMBOLS[c as FiatCurrency];
}

export function useCurrency() {
  const currency = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Hydrate once from localStorage after mount (kept out of the first render to avoid an SSR/CSR
  // mismatch), keep in sync across tabs, and warm the crypto rates so a crypto view renders correctly.
  useEffect(() => {
    loadCryptoRates();
    if (!hydrated) {
      hydrated = true;
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as Currency | null;
        if (stored && (CURRENCIES as readonly string[]).includes(stored) && stored !== current) {
          current = stored;
          if (isCrypto(current)) loadCryptoRates();
          emit();
        }
      } catch {}
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue && (CURRENCIES as readonly string[]).includes(e.newValue)) {
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
    toUsdc: (amount: number) => toUsdc(amount, currency),
    symbol: symbolFor(currency),
    isCrypto: isCrypto(currency),
  };
}
