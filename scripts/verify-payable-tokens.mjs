// Verifies the expanded payable-token addresses in src/lib/payable-tokens.ts against Li.Fi's LIVE token
// list, so you can trust them before flipping NEXT_PUBLIC_MULTICRYPTO_ENABLED on at mainnet cutover.
//
// Run:  node scripts/verify-payable-tokens.mjs
// Exit: 0 if every token + per-chain USDC matches Li.Fi (address on the right chain, right symbol +
//       decimals); non-zero if anything is missing or mismatched.
//
// The expected list below MIRRORS src/lib/payable-tokens.ts — if you edit the registry, mirror it here.
// (Kept inline on purpose so this runs with plain `node`, no TS runner or deps.)

const CHAINS = { ETH: 1, POLYGON: 137, BSC: 56, AVALANCHE: 43114, ARBITRUM: 42161, OPTIMISM: 10 };
const NATIVE = '0x0000000000000000000000000000000000000000';

// Per-chain USDC (the swap target — toToken). Must match the USDC map in payable-tokens.ts.
const USDC = {
  [CHAINS.ETH]: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  [CHAINS.POLYGON]: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
  [CHAINS.BSC]: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  [CHAINS.AVALANCHE]: { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
  [CHAINS.ARBITRUM]: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  [CHAINS.OPTIMISM]: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
};

// The swap tokens buyers pay WITH (fromToken). BTC lives on Li.Fi's synthetic Bitcoin chain and isn't in
// the EVM /v1/tokens response, so it's checked separately/skipped here (it's the pre-existing route).
const TOKENS = [
  { symbol: 'ETH', chain: CHAINS.ETH, address: NATIVE, decimals: 18 },
  { symbol: 'USDT', chain: CHAINS.ETH, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  { symbol: 'DAI', chain: CHAINS.ETH, address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  { symbol: 'LINK', chain: CHAINS.ETH, address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
  { symbol: 'UNI', chain: CHAINS.ETH, address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
  { symbol: 'POL', chain: CHAINS.POLYGON, address: NATIVE, decimals: 18 },
  { symbol: 'AVAX', chain: CHAINS.AVALANCHE, address: NATIVE, decimals: 18 },
  { symbol: 'BNB', chain: CHAINS.BSC, address: NATIVE, decimals: 18 },
  { symbol: 'ARB', chain: CHAINS.ARBITRUM, address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  { symbol: 'OP', chain: CHAINS.OPTIMISM, address: '0x4200000000000000000000000000000000000042', decimals: 18 },
];

const chainIds = [...new Set([...TOKENS.map((t) => t.chain), ...Object.keys(USDC).map(Number)])];

function findToken(byChain, chainId, address) {
  const list = byChain[String(chainId)] ?? [];
  return list.find((t) => (t.address ?? '').toLowerCase() === address.toLowerCase());
}

function check(byChain, label, chainId, address, expectSym, expectDec) {
  const hit = findToken(byChain, chainId, address);
  if (!hit) return { ok: false, label, chainId, note: 'NOT in Li.Fi token list for this chain' };
  const symOk = expectSym == null || (hit.symbol ?? '').toUpperCase() === expectSym.toUpperCase();
  const decOk = expectDec == null || Number(hit.decimals) === Number(expectDec);
  if (!symOk) return { ok: false, label, chainId, note: `symbol mismatch: Li.Fi says ${hit.symbol}` };
  if (!decOk) return { ok: false, label, chainId, note: `decimals mismatch: Li.Fi says ${hit.decimals}` };
  return { ok: true, label, chainId, note: `${hit.symbol} · ${hit.decimals}dp` };
}

async function main() {
  const url = `https://li.quest/v1/tokens?chains=${chainIds.join(',')}`;
  console.log(`Fetching Li.Fi token list for chains ${chainIds.join(', ')} …\n`);
  const res = await fetch(url);
  if (!res.ok) { console.error(`Li.Fi API error ${res.status}`); process.exit(2); }
  const byChain = (await res.json()).tokens ?? {};

  const rows = [];
  for (const t of TOKENS) rows.push(check(byChain, `${t.symbol} (pay-with)`, t.chain, t.address, t.symbol, t.decimals));
  for (const [chainId, u] of Object.entries(USDC)) rows.push(check(byChain, `USDC on ${chainId} (settle-to)`, Number(chainId), u.address, 'USDC', u.decimals));

  let bad = 0;
  for (const r of rows) {
    console.log(`${r.ok ? '  OK ' : ' FAIL'}  chain ${String(r.chainId).padEnd(14)} ${r.label.padEnd(24)} ${r.note}`);
    if (!r.ok) bad++;
  }
  console.log(`\nBTC: not checked here (synthetic Li.Fi chain, pre-existing route) — confirm manually if changed.`);
  console.log(bad === 0 ? '\nALL MATCH — safe to enable multi-crypto.' : `\n${bad} MISMATCH(es) — fix in src/lib/payable-tokens.ts before enabling.`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
