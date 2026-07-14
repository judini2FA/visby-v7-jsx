'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getToken } from '@/lib/payable-tokens';

// Blueprint W2 — omni-currency. ~90 ISO fiat codes + ~13 crypto tokens, any settable as the user's
// preferred DISPLAY currency. Settlement is always USDC/SOL regardless of what's picked here — this
// module only controls how amounts are shown and how a typed amount converts to/from USDC.
//
// Every export below keeps its original signature/behavior for the original 9 codes
// (USD EUR GBP JPY AUD CAD SOL ETH BTC) — this file is read-only-consumed by several other pages
// (see currency.test.ts, currency-sync.tsx, item/[id], settings, wallet, etc.), so growing the
// registry must never be a breaking change for them.

// ── Fiat registry ───────────────────────────────────────────────────────────────────────────────
// [code, symbol, name, seedRate] — seedRate = units of that currency per 1 USD, used the instant the
// module loads (synchronously, before any network round trip) and as the last-good fallback if the
// live fetch (below) ever fails. Overwritten by /api/price/rates once it resolves.
const FIAT_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD',
  'SEK', 'NOK', 'DKK', 'SGD', 'KRW', 'INR', 'MXN', 'BRL', 'ZAR', 'TRY',
  'RUB', 'PLN', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'AED',
  'SAR', 'MYR', 'RON', 'COP', 'PEN', 'ARS', 'VND', 'UAH', 'BGN', 'NGN',
  'EGP', 'PKR', 'BDT', 'KES', 'GHS', 'MAD', 'DZD', 'TND', 'JOD', 'KWD',
  'BHD', 'OMR', 'QAR', 'LKR', 'KZT', 'ISK', 'UYU', 'PYG', 'BOB', 'CRC',
  'GTQ', 'HNL', 'NIO', 'PAB', 'DOP', 'JMD', 'TTD', 'BBD', 'BSD', 'BZD',
  'XCD', 'NAD', 'BWP', 'ZMW', 'MWK', 'TZS', 'UGX', 'RWF', 'ETB', 'MMK',
  'KHR', 'LAK', 'NPR', 'MNT', 'BND', 'TWD', 'MUR', 'SCR', 'XAF', 'XOF',
] as const;

const CRYPTO_CURRENCIES = [
  'SOL', 'ETH', 'BTC', 'USDC', 'USDT', 'DAI', 'LINK', 'UNI', 'POL', 'AVAX', 'BNB', 'ARB', 'OP',
] as const;

export { FIAT_CURRENCIES, CRYPTO_CURRENCIES };
export const CURRENCIES = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES] as const;
export type FiatCurrency = typeof FIAT_CURRENCIES[number];
export type CryptoCurrency = typeof CRYPTO_CURRENCIES[number];
export type Currency = typeof CURRENCIES[number];

export function isCrypto(c: Currency): c is CryptoCurrency {
  return (CRYPTO_CURRENCIES as readonly string[]).includes(c);
}

const SYMBOLS: Record<FiatCurrency, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$', CHF: 'CHF', CNY: '¥', HKD: 'HK$', NZD: 'NZ$',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', SGD: 'S$', KRW: '₩', INR: '₹', MXN: '$', BRL: 'R$', ZAR: 'R', TRY: '₺',
  RUB: '₽', PLN: 'zł', THB: '฿', IDR: 'Rp', HUF: 'Ft', CZK: 'Kč', ILS: '₪', CLP: '$', PHP: '₱', AED: 'د.إ',
  SAR: '﷼', MYR: 'RM', RON: 'lei', COP: '$', PEN: 'S/', ARS: '$', VND: '₫', UAH: '₴', BGN: 'лв', NGN: '₦',
  EGP: 'E£', PKR: '₨', BDT: '৳', KES: 'KSh', GHS: 'GH₵', MAD: 'د.م.', DZD: 'د.ج', TND: 'د.ت', JOD: 'د.ا', KWD: 'د.ك',
  BHD: '.د.ب', OMR: 'ر.ع.', QAR: 'ر.ق', LKR: 'Rs', KZT: '₸', ISK: 'kr', UYU: '$U', PYG: '₲', BOB: 'Bs.', CRC: '₡',
  GTQ: 'Q', HNL: 'L', NIO: 'C$', PAB: 'B/.', DOP: 'RD$', JMD: 'J$', TTD: 'TT$', BBD: 'Bds$', BSD: 'B$', BZD: 'BZ$',
  XCD: 'EC$', NAD: 'N$', BWP: 'P', ZMW: 'ZK', MWK: 'MK', TZS: 'TSh', UGX: 'USh', RWF: 'RF', ETB: 'Br', MMK: 'K',
  KHR: '៛', LAK: '₭', NPR: '₨', MNT: '₮', BND: 'B$', TWD: 'NT$', MUR: '₨', SCR: '₨', XAF: 'FCFA', XOF: 'CFA',
};

const NAMES: Record<FiatCurrency, string> = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen', AUD: 'Australian Dollar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc', CNY: 'Chinese Yuan', HKD: 'Hong Kong Dollar', NZD: 'New Zealand Dollar',
  SEK: 'Swedish Krona', NOK: 'Norwegian Krone', DKK: 'Danish Krone', SGD: 'Singapore Dollar', KRW: 'South Korean Won', INR: 'Indian Rupee', MXN: 'Mexican Peso', BRL: 'Brazilian Real', ZAR: 'South African Rand', TRY: 'Turkish Lira',
  RUB: 'Russian Ruble', PLN: 'Polish Zloty', THB: 'Thai Baht', IDR: 'Indonesian Rupiah', HUF: 'Hungarian Forint', CZK: 'Czech Koruna', ILS: 'Israeli New Shekel', CLP: 'Chilean Peso', PHP: 'Philippine Peso', AED: 'UAE Dirham',
  SAR: 'Saudi Riyal', MYR: 'Malaysian Ringgit', RON: 'Romanian Leu', COP: 'Colombian Peso', PEN: 'Peruvian Sol', ARS: 'Argentine Peso', VND: 'Vietnamese Dong', UAH: 'Ukrainian Hryvnia', BGN: 'Bulgarian Lev', NGN: 'Nigerian Naira',
  EGP: 'Egyptian Pound', PKR: 'Pakistani Rupee', BDT: 'Bangladeshi Taka', KES: 'Kenyan Shilling', GHS: 'Ghanaian Cedi', MAD: 'Moroccan Dirham', DZD: 'Algerian Dinar', TND: 'Tunisian Dinar', JOD: 'Jordanian Dinar', KWD: 'Kuwaiti Dinar',
  BHD: 'Bahraini Dinar', OMR: 'Omani Rial', QAR: 'Qatari Riyal', LKR: 'Sri Lankan Rupee', KZT: 'Kazakhstani Tenge', ISK: 'Icelandic Krona', UYU: 'Uruguayan Peso', PYG: 'Paraguayan Guarani', BOB: 'Bolivian Boliviano', CRC: 'Costa Rican Colon',
  GTQ: 'Guatemalan Quetzal', HNL: 'Honduran Lempira', NIO: 'Nicaraguan Cordoba', PAB: 'Panamanian Balboa', DOP: 'Dominican Peso', JMD: 'Jamaican Dollar', TTD: 'Trinidad & Tobago Dollar', BBD: 'Barbadian Dollar', BSD: 'Bahamian Dollar', BZD: 'Belize Dollar',
  XCD: 'East Caribbean Dollar', NAD: 'Namibian Dollar', BWP: 'Botswana Pula', ZMW: 'Zambian Kwacha', MWK: 'Malawian Kwacha', TZS: 'Tanzanian Shilling', UGX: 'Ugandan Shilling', RWF: 'Rwandan Franc', ETB: 'Ethiopian Birr', MMK: 'Myanmar Kyat',
  KHR: 'Cambodian Riel', LAK: 'Lao Kip', NPR: 'Nepalese Rupee', MNT: 'Mongolian Tugrik', BND: 'Brunei Dollar', TWD: 'New Taiwan Dollar', MUR: 'Mauritian Rupee', SCR: 'Seychellois Rupee', XAF: 'Central African CFA Franc', XOF: 'West African CFA Franc',
};

// Static seed / last-good-fallback rates (USD ≈ USDC → fiat). Display only — settlement is always
// USDC/SOL. Overwritten in the background by live rates from /api/price/rates once they load (same
// pattern as the crypto rates below), so a page never blocks render on a network round trip.
const RATES: Record<FiatCurrency, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, AUD: 1.53, CAD: 1.36, CHF: 0.88, CNY: 7.24, HKD: 7.82, NZD: 1.66,
  SEK: 10.4, NOK: 10.6, DKK: 6.86, SGD: 1.34, KRW: 1330, INR: 83.3, MXN: 17.0, BRL: 5.1, ZAR: 18.6, TRY: 32.5,
  RUB: 92.0, PLN: 3.95, THB: 35.8, IDR: 15750, HUF: 355, CZK: 22.9, ILS: 3.7, CLP: 950, PHP: 56.2, AED: 3.67,
  SAR: 3.75, MYR: 4.7, RON: 4.57, COP: 3950, PEN: 3.75, ARS: 900, VND: 24500, UAH: 39.5, BGN: 1.8, NGN: 1450,
  EGP: 47.5, PKR: 278, BDT: 110, KES: 128, GHS: 14.7, MAD: 9.95, DZD: 134.5, TND: 3.11, JOD: 0.709, KWD: 0.307,
  BHD: 0.377, OMR: 0.385, QAR: 3.64, LKR: 300, KZT: 445, ISK: 138, UYU: 39.0, PYG: 7300, BOB: 6.91, CRC: 505,
  GTQ: 7.75, HNL: 24.7, NIO: 36.8, PAB: 1.0, DOP: 59.0, JMD: 156, TTD: 6.78, BBD: 2.0, BSD: 1.0, BZD: 2.02,
  XCD: 2.7, NAD: 18.6, BWP: 13.6, ZMW: 26.0, MWK: 1740, TZS: 2540, UGX: 3720, RWF: 1320, ETB: 57.0, MMK: 2100,
  KHR: 4100, LAK: 21600, NPR: 133, MNT: 3450, BND: 1.34, TWD: 32.0, MUR: 46.5, SCR: 13.5, XAF: 605, XOF: 605,
};

// Decimal-place overrides — zero-decimal and three-decimal ISO currencies. Everything else defaults to 2.
const FIAT_DP_OVERRIDE: Partial<Record<FiatCurrency, number>> = {
  JPY: 0, KRW: 0, IDR: 0, CLP: 0, VND: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0,
  TND: 3, JOD: 3, KWD: 3, BHD: 3, OMR: 3,
};
function fiatDecimals(c: FiatCurrency): number {
  return FIAT_DP_OVERRIDE[c] ?? 2;
}

// ── Crypto registry ─────────────────────────────────────────────────────────────────────────────
// name/cgId/dp are sourced from payable-tokens.ts (the single source of truth for what's payable)
// rather than re-declared here, so the two lists can never drift. USDC has no cgId there (pegged
// 1:1, no swap route needed) so it's the one manual entry.
const CRYPTO_NAMES: Record<CryptoCurrency, string> = {
  SOL: 'Solana', ETH: 'Ethereum', BTC: 'Bitcoin', USDC: 'USD Coin', USDT: 'Tether', DAI: 'Dai',
  LINK: 'Chainlink', UNI: 'Uniswap', POL: 'Polygon', AVAX: 'Avalanche', BNB: 'BNB', ARB: 'Arbitrum', OP: 'Optimism',
};

// Display precision per coin (decimal places, max 6 — matches the swap-token dp already used at checkout).
const CRYPTO_DP: Record<CryptoCurrency, number> = Object.fromEntries(
  CRYPTO_CURRENCIES.map((c) => [c, c === 'USDC' ? 2 : (getToken(c)?.dp ?? 4)]),
) as Record<CryptoCurrency, number>;

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

// Live USD price per coin (CoinGecko-backed via /api/price/rates) and live fiat rates (open.er-api.com,
// same route). Until the first load arrives, a view falls back to the seed table above so a price
// never renders blank.
let cryptoUsd: Partial<Record<CryptoCurrency, number>> = {};
let liveFiatRates: Partial<Record<FiatCurrency, number>> = {};
let ratesFetchedAt = 0;
let ratesInFlight = false;
let refresherStarted = false;
const RATES_TTL_MS = 60_000; // matches the server-side /api/price/rates cache window

function loadRates() {
  if (ratesInFlight || typeof window === 'undefined') return;
  if (ratesFetchedAt && Date.now() - ratesFetchedAt < RATES_TTL_MS) return; // still fresh
  ratesInFlight = true;
  fetch('/api/price/rates')
    .then((r) => r.json())
    .then((j: { usd?: Record<string, number>; fiat?: Record<string, number> }) => {
      let changed = false;
      if (j?.usd && typeof j.usd === 'object') {
        cryptoUsd = j.usd as Partial<Record<CryptoCurrency, number>>;
        changed = true;
      }
      if (j?.fiat && typeof j.fiat === 'object') {
        const next: Partial<Record<FiatCurrency, number>> = {};
        for (const code of FIAT_CURRENCIES) {
          const v = j.fiat[code];
          if (typeof v === 'number' && v > 0) next[code] = v;
        }
        liveFiatRates = next;
        changed = true;
      }
      if (changed) { ratesFetchedAt = Date.now(); emit(); }
    })
    .catch(() => {})
    .finally(() => { ratesInFlight = false; });
  ensureRefresher();
}

// A price view must stay current, not freeze at first load. Refresh on an interval and whenever the
// tab regains focus (rates can be minutes stale after the tab is backgrounded). One module-level
// refresher, not one per useCurrency() consumer.
function ensureRefresher() {
  if (refresherStarted || typeof window === 'undefined') return;
  refresherStarted = true;
  setInterval(loadRates, RATES_TTL_MS);
  const refetchIfVisible = () => { if (document.visibilityState === 'visible') loadRates(); };
  document.addEventListener('visibilitychange', refetchIfVisible);
  window.addEventListener('focus', refetchIfVisible);
}

export function setCurrency(c: Currency) {
  if (c === current) return;
  current = c;
  try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  loadRates();
  emit();
}

function fiatRate(c: FiatCurrency): number {
  return liveFiatRates[c] ?? RATES[c] ?? 1;
}

export function formatCurrency(usdcAmount: number, c: Currency = current): string {
  if (isCrypto(c)) {
    const rate = cryptoUsd[c];
    if (!rate) return formatCurrency(usdcAmount, 'USD'); // rates not loaded yet → USD fallback
    const coin = usdcAmount / rate;
    return `${coin.toLocaleString('en-US', { maximumFractionDigits: CRYPTO_DP[c] })} ${c}`;
  }
  const f = c as FiatCurrency;
  const v = usdcAmount * fiatRate(f);
  const dp = fiatDecimals(f);
  if (dp === 0) return `${SYMBOLS[f]}${Math.round(v).toLocaleString()}`;
  return `${SYMBOLS[f]}${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

// A fiat OR crypto amount the user typed → its USDC (≈ USD) value.
export function toUsdc(amount: number, c: Currency = current): number {
  if (isCrypto(c)) {
    const rate = cryptoUsd[c];
    return rate ? amount * rate : amount; // until rates load, best-effort 1:1
  }
  return amount / fiatRate(c as FiatCurrency);
}

function symbolFor(c: Currency): string {
  return isCrypto(c) ? c : SYMBOLS[c as FiatCurrency];
}

// ── Metadata registry — for CurrencyPicker and any other consumer that needs to list/search
// currencies rather than just format a number. ──
export interface CurrencyMeta {
  code: Currency;
  symbol: string;
  name: string;
  decimals: number;
  type: 'fiat' | 'crypto';
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  ...Object.fromEntries(FIAT_CURRENCIES.map((code) => [code, {
    code, symbol: SYMBOLS[code], name: NAMES[code], decimals: fiatDecimals(code), type: 'fiat' as const,
  }])),
  ...Object.fromEntries(CRYPTO_CURRENCIES.map((code) => [code, {
    code, symbol: code, name: CRYPTO_NAMES[code], decimals: CRYPTO_DP[code], type: 'crypto' as const,
  }])),
} as Record<Currency, CurrencyMeta>;

// Flat, ordered list (fiat majors-first, then crypto) — convenient for a picker to group/iterate.
export const CURRENCY_LIST: CurrencyMeta[] = CURRENCIES.map((c) => CURRENCY_META[c]);

export function getCurrencyMeta(c: Currency): CurrencyMeta {
  return CURRENCY_META[c];
}

export function useCurrency() {
  const currency = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Hydrate once from localStorage after mount (kept out of the first render to avoid an SSR/CSR
  // mismatch), keep in sync across tabs, and warm the rates so a price view renders correctly.
  useEffect(() => {
    loadRates();
    if (!hydrated) {
      hydrated = true;
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as Currency | null;
        if (stored && (CURRENCIES as readonly string[]).includes(stored) && stored !== current) {
          current = stored;
          loadRates();
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
