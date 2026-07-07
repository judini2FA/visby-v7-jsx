import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PAYABLE_TOKENS,
  getToken,
  isSwapToken,
  tokenDisplay,
  visibleTokens,
  multiCryptoEnabled,
  achEnabled,
} from '@/lib/payable-tokens';

// Blueprint 11.4 — the buyer-facing payable-token gating + lookup helpers on malformed/unknown input.
// getToken/isSwapToken/tokenDisplay are PURE lookups over the static table (no env, no network); the
// visibility helpers read env, so they're asserted only against their documented default (flags UNSET →
// gated + ACH hidden), which is deterministic without secrets.

describe('payable-tokens — getToken lookup', () => {
  it('resolves a known ungated symbol', () => {
    expect(getToken('CARD')?.kind).toBe('card');
    expect(getToken('SOL')?.kind).toBe('sol');
    expect(getToken('USDC')?.kind).toBe('usdc');
    expect(getToken('ETH')?.kind).toBe('swap');
  });

  it('returns undefined for an unknown / malformed symbol rather than throwing', () => {
    expect(getToken('DOGE')).toBeUndefined();
    expect(getToken('')).toBeUndefined();
    expect(getToken('eth')).toBeUndefined(); // case-sensitive
    expect(getToken(' ETH ')).toBeUndefined();
    expect(getToken('ETH; DROP TABLE')).toBeUndefined();
    // @ts-expect-error — hostile non-string input must not crash the lookup
    expect(getToken(null)).toBeUndefined();
    // @ts-expect-error
    expect(getToken(undefined)).toBeUndefined();
  });
});

describe('payable-tokens — isSwapToken', () => {
  it('is true only for kind === "swap"', () => {
    expect(isSwapToken('ETH')).toBe(true);
    expect(isSwapToken('BTC')).toBe(true);
    expect(isSwapToken('USDT')).toBe(true); // gated but still a swap token by kind
    expect(isSwapToken('SOL')).toBe(false);
    expect(isSwapToken('USDC')).toBe(false);
    expect(isSwapToken('CARD')).toBe(false);
    expect(isSwapToken('ACH')).toBe(false);
  });

  it('is false (not thrown) for an unknown symbol', () => {
    expect(isSwapToken('NOPE')).toBe(false);
    expect(isSwapToken('')).toBe(false);
  });
});

describe('payable-tokens — tokenDisplay', () => {
  it('formats to the token-specific decimal places', () => {
    expect(tokenDisplay('SOL', 1.23456)).toBe('1.2346 SOL'); // dp 4
    expect(tokenDisplay('BTC', 0.123456789)).toBe('0.123457 BTC'); // dp 6
    expect(tokenDisplay('USDC', 12.5)).toBe('12.50 USDC'); // dp 2
  });

  it('falls back to 4 dp for an unknown symbol without throwing', () => {
    expect(tokenDisplay('MYSTERY', 1)).toBe('1.0000 MYSTERY');
  });

  it('handles zero, negative and integer amounts', () => {
    expect(tokenDisplay('USDC', 0)).toBe('0.00 USDC');
    expect(tokenDisplay('USDC', -5)).toBe('-5.00 USDC');
    expect(tokenDisplay('SOL', 100)).toBe('100.0000 SOL');
  });
});

describe('payable-tokens — swap tokens all carry a route + decimals', () => {
  it('every kind:"swap" entry has a route and on-chain decimals (invariant the quote path relies on)', () => {
    for (const t of PAYABLE_TOKENS.filter((x) => x.kind === 'swap')) {
      expect(t.route, `${t.symbol} route`).toBeDefined();
      expect(typeof t.decimals, `${t.symbol} decimals`).toBe('number');
      expect(t.route!.fromToken).toBeTruthy();
      expect(typeof t.route!.fromChain).toBe('number');
    }
  });

  it('token symbols are unique (getToken can never be ambiguous)', () => {
    const symbols = PAYABLE_TOKENS.map((t) => t.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });
});

describe('payable-tokens — visibility gating defaults (flags unset)', () => {
  const prevMulti = process.env.NEXT_PUBLIC_MULTICRYPTO_ENABLED;
  const prevAch = process.env.NEXT_PUBLIC_ACH_ENABLED;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_MULTICRYPTO_ENABLED;
    delete process.env.NEXT_PUBLIC_ACH_ENABLED;
  });
  afterEach(() => {
    if (prevMulti === undefined) delete process.env.NEXT_PUBLIC_MULTICRYPTO_ENABLED;
    else process.env.NEXT_PUBLIC_MULTICRYPTO_ENABLED = prevMulti;
    if (prevAch === undefined) delete process.env.NEXT_PUBLIC_ACH_ENABLED;
    else process.env.NEXT_PUBLIC_ACH_ENABLED = prevAch;
  });

  it('flags default to OFF', () => {
    expect(multiCryptoEnabled()).toBe(false);
    expect(achEnabled()).toBe(false);
  });

  it('hides every gated token and ACH when the flags are off', () => {
    const visible = visibleTokens().map((t) => t.symbol);
    // no gated token leaks through
    for (const t of PAYABLE_TOKENS.filter((x) => x.gated)) {
      expect(visible).not.toContain(t.symbol);
    }
    // ACH is hidden behind its own flag
    expect(visible).not.toContain('ACH');
    // but the always-on rails stay visible
    expect(visible).toEqual(expect.arrayContaining(['CARD', 'SOL', 'ETH', 'BTC', 'USDC']));
  });

  it('a truthy-but-not-"1" flag value is still treated as OFF (strict === "1")', () => {
    process.env.NEXT_PUBLIC_MULTICRYPTO_ENABLED = 'true';
    expect(multiCryptoEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_MULTICRYPTO_ENABLED = 'yes';
    expect(multiCryptoEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_MULTICRYPTO_ENABLED = '0';
    expect(multiCryptoEnabled()).toBe(false);
  });
});
