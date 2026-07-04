// Single source of truth for what a buyer can pay with. Client-safe plain data (no @lifi/sdk import),
// so both the checkout UI and the server swap-quote route derive from it — adding a token is one entry.
//
// Settlement is ALWAYS USDC to the seller: 'swap' tokens route through Li.Fi to USDC; SOL/USDC settle
// natively; CARD via Stripe/Moov. The 'swap' set beyond ETH/BTC is GATED behind
// NEXT_PUBLIC_MULTICRYPTO_ENABLED and is MAINNET-ONLY (Li.Fi has no devnet liquidity, and swap-pay is
// devnet-simulated / mainnet-disabled), so it stays hidden until mainnet cutover flips the flag.
//
// !!! VERIFY EVERY chain id + token/USDC address against Li.Fi's live token list before enabling on
// mainnet. These are canonical mainnet addresses but must not be trusted blind for real settlement.

export type PayKind = 'card' | 'ach' | 'sol' | 'usdc' | 'swap';

// Quote-only routing for a 'swap' token (Li.Fi estimates a route to USDC). fromAddress/toAddress are
// placeholder addresses Li.Fi needs to estimate gas — nothing is ever signed with them here.
export interface SwapRoute {
  fromChain: number;   // numeric chain id (Ethereum 1, Polygon 137, …; Li.Fi accepts the raw number)
  fromToken: string;   // token address on fromChain; native gas token = 0x000…000; BTC = 'bitcoin'
  toChain: number;     // destination chain for the USDC leg
  toToken: string;     // USDC address on toChain
  fromAddress: string; // quote-only placeholder holder address on fromChain
  toAddress?: string;  // quote-only recipient on toChain (needed for cross-chain / bridge routes)
}

export interface PayableToken {
  symbol: string;      // stable id used everywhere ('ETH', 'MATIC', …)
  label: string;       // tab label
  kind: PayKind;
  gated?: boolean;     // hidden unless NEXT_PUBLIC_MULTICRYPTO_ENABLED === '1'
  cgId?: string;       // CoinGecko price id (swap tokens)
  decimals?: number;   // on-chain token decimals (swap tokens)
  dp?: number;         // display decimal places
  route?: SwapRoute;   // present for kind === 'swap'
}

// EVM chain ids (raw numbers so this file never imports the Li.Fi SDK).
const ETH = 1, POLYGON = 137, BSC = 56, AVALANCHE = 43114, ARBITRUM = 42161, OPTIMISM = 10;
const BTC_CHAIN = 20000000000001; // Li.Fi's Bitcoin chain id

// Canonical mainnet USDC per chain (VERIFY before mainnet).
const USDC = {
  [ETH]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [POLYGON]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  [BSC]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  [AVALANCHE]: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  [ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [OPTIMISM]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
} as Record<number, string>;

const NATIVE = '0x0000000000000000000000000000000000000000';
const EVM_HOLDER = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // quote-only
const BTC_HOLDER = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';  // quote-only

// A same-chain swap of an EVM token → that chain's USDC.
function sameChain(chain: number, fromToken: string): SwapRoute {
  return { fromChain: chain, fromToken, toChain: chain, toToken: USDC[chain], fromAddress: EVM_HOLDER };
}

export const PAYABLE_TOKENS: PayableToken[] = [
  { symbol: 'CARD', label: 'Card', kind: 'card' },
  // ACH bank-debit pay-in (4.4). Settles asynchronously (1–3 business days) so the item is fulfilled
  // only on payment_intent.succeeded — see /api/stripe/ach-payment-intent. Hidden until
  // NEXT_PUBLIC_ACH_ENABLED === '1' (dark launch until a live ACH test passes).
  { symbol: 'ACH', label: 'Bank', kind: 'ach' },
  { symbol: 'SOL', label: 'SOL', kind: 'sol', cgId: 'solana', dp: 4 },
  { symbol: 'ETH', label: 'ETH', kind: 'swap', cgId: 'ethereum', decimals: 18, dp: 5, route: sameChain(ETH, NATIVE) },
  {
    symbol: 'BTC', label: 'BTC', kind: 'swap', cgId: 'bitcoin', decimals: 8, dp: 6,
    route: { fromChain: BTC_CHAIN, fromToken: 'bitcoin', toChain: ETH, toToken: USDC[ETH], fromAddress: BTC_HOLDER, toAddress: EVM_HOLDER },
  },
  { symbol: 'USDC', label: 'USDC', kind: 'usdc', dp: 2 },

  // ── Expanded set — GATED + MAINNET-ONLY (NEXT_PUBLIC_MULTICRYPTO_ENABLED) ──
  { symbol: 'USDT', label: 'USDT', kind: 'swap', gated: true, cgId: 'tether', decimals: 6, dp: 2, route: sameChain(ETH, '0xdAC17F958D2ee523a2206206994597C13D831ec7') },
  { symbol: 'DAI', label: 'DAI', kind: 'swap', gated: true, cgId: 'dai', decimals: 18, dp: 2, route: sameChain(ETH, '0x6B175474E89094C44Da98b954EedeAC495271d0F') },
  { symbol: 'LINK', label: 'LINK', kind: 'swap', gated: true, cgId: 'chainlink', decimals: 18, dp: 4, route: sameChain(ETH, '0x514910771AF9Ca656af840dff83E8264EcF986CA') },
  { symbol: 'UNI', label: 'UNI', kind: 'swap', gated: true, cgId: 'uniswap', decimals: 18, dp: 4, route: sameChain(ETH, '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984') },
  { symbol: 'POL', label: 'POL', kind: 'swap', gated: true, cgId: 'matic-network', decimals: 18, dp: 3, route: sameChain(POLYGON, NATIVE) },
  { symbol: 'AVAX', label: 'AVAX', kind: 'swap', gated: true, cgId: 'avalanche-2', decimals: 18, dp: 4, route: sameChain(AVALANCHE, NATIVE) },
  { symbol: 'BNB', label: 'BNB', kind: 'swap', gated: true, cgId: 'binancecoin', decimals: 18, dp: 5, route: sameChain(BSC, NATIVE) },
  { symbol: 'ARB', label: 'ARB', kind: 'swap', gated: true, cgId: 'arbitrum', decimals: 18, dp: 3, route: sameChain(ARBITRUM, '0x912CE59144191C1204E64559FE8253a0e49E6548') },
  { symbol: 'OP', label: 'OP', kind: 'swap', gated: true, cgId: 'optimism', decimals: 18, dp: 3, route: sameChain(OPTIMISM, '0x4200000000000000000000000000000000000042') },
];

export function multiCryptoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MULTICRYPTO_ENABLED === '1';
}

// ACH bank-debit is dark-launched behind its own flag (separate from the multi-crypto gate) so it
// stays hidden until a live ACH pay-in test passes.
export function achEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACH_ENABLED === '1';
}

// Tokens the buyer may currently choose — the gated set only appears once multi-crypto is enabled, and
// ACH only once its own flag is on.
export function visibleTokens(): PayableToken[] {
  return PAYABLE_TOKENS.filter((t) => {
    if (t.gated && !multiCryptoEnabled()) return false;
    if (t.kind === 'ach' && !achEnabled()) return false;
    return true;
  });
}

export function getToken(symbol: string): PayableToken | undefined {
  return PAYABLE_TOKENS.find((t) => t.symbol === symbol);
}

// A currency that settles by swapping to USDC through Li.Fi (drives the generic swap-quote UI path).
export function isSwapToken(symbol: string): boolean {
  return getToken(symbol)?.kind === 'swap';
}

export function tokenDisplay(symbol: string, amount: number): string {
  const t = getToken(symbol);
  return `${amount.toFixed(t?.dp ?? 4)} ${symbol}`;
}
