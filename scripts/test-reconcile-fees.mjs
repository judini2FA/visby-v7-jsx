// Unit test for src/lib/reconcile.ts (blueprint 4.8).
//
// Run:  node scripts/test-reconcile-fees.mjs
// Exit: 0 if every assertion passes, non-zero (with a FAIL line per failure) otherwise.
//
// src/lib/reconcile.ts imports src/lib/fees.ts, both plain TypeScript with zero external deps and
// only erasable type syntax (union/object types, `Record<...>`/param/return annotations — no
// enums/namespaces/decorators), so modern Node (>=22.6 with --experimental-strip-types, unflagged
// since 23.6) can `import()` them straight off disk. That's the primary path below. If the Node
// running this happens to be too old for that, we fall back to a zero-dependency regex strip (no
// esbuild/tsx — this repo has neither installed) that erases the same handful of TS-only
// constructs into a temp dir (both files together, so the relative `./fees` import resolves) and
// re-imports the transpiled copy. Either way, the test exercises the REAL exported reconcileOrder
// from the lib, not a hand-copied stand-in.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const LIB_DIR = join(__dirname, '..', 'src', 'lib');
const RECONCILE_PATH = join(LIB_DIR, 'reconcile.ts');

let mod;
try {
  // Node's ESM loader resolves specifiers literally — it won't append a missing extension even
  // with type-stripping enabled, so reconcile.ts's extensionless `from './fees'` can't be imported
  // in place. Stage both files in a temp dir with the specifier rewritten to `./fees.ts` (source
  // untouched otherwise) and import from there — this is still the REAL, un-transpiled TS source.
  const stageDir = mkdtempSync(join(tmpdir(), 'reconcile-native-'));
  writeFileSync(join(stageDir, 'fees.ts'), readFileSync(join(LIB_DIR, 'fees.ts'), 'utf8'), 'utf8');
  const stagedReconcile = join(stageDir, 'reconcile.ts');
  writeFileSync(
    stagedReconcile,
    readFileSync(RECONCILE_PATH, 'utf8').replace("from './fees'", "from './fees.ts'"),
    'utf8',
  );
  mod = await import(pathToFileURL(stagedReconcile).href);
} catch (nativeErr) {
  // Fallback: strip TS-only syntax from both reconcile.ts and fees.ts, write them side by side in a
  // temp dir (so the relative import resolves), and import the stripped reconcile.ts from there.
  function stripTs(src) {
    return src
      .replace(/^export type[\s\S]*?;\s*$/gm, (m) => (m.startsWith('export type') ? '' : m))
      .replace(/:\s*keyof typeof FEE_BPS/g, '')
      .replace(/:\s*unknown/g, '')
      .replace(/:\s*number\b/g, '')
      .replace(/:\s*boolean\b/g, '')
      .replace(/:\s*string \| null\b/g, '')
      .replace(/:\s*string\b/g, '')
      .replace(/\sis SaleChannel\b/g, '')
      .replace(/<SaleChannel>/g, '')
      .replace(/as SaleChannel/g, '')
      .replace(/as const/g, '')
      .replace(/export type ReconcilableOrder[\s\S]*?^\};\s*$/m, '')
      .replace(/export type ReconcileResult[\s\S]*?^\};\s*$/m, '');
  }

  const reconcileSrc = stripTs(readFileSync(RECONCILE_PATH, 'utf8'));
  const feesSrc = stripTs(readFileSync(join(LIB_DIR, 'fees.ts'), 'utf8'));

  const tmpDir = mkdtempSync(join(tmpdir(), 'reconcile-test-'));
  writeFileSync(join(tmpDir, 'fees.mjs'), feesSrc.replace(/from '\.\/fees'/g, "from './fees.mjs'"), 'utf8');
  const tmpReconcile = join(tmpDir, 'reconcile.mjs');
  writeFileSync(tmpReconcile, reconcileSrc.replace(/from '\.\/fees'/g, "from './fees.mjs'"), 'utf8');

  try {
    mod = await import(pathToFileURL(tmpReconcile).href);
  } catch (fallbackErr) {
    console.error('FAIL: could not import src/lib/reconcile.ts natively OR via fallback strip.');
    console.error('  native import error:', nativeErr.message);
    console.error('  fallback import error:', fallbackErr.message);
    process.exit(1);
  }
}

const { reconcileOrder } = mod;

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
  }
}

function baseOrder(overrides) {
  return {
    id: 'order_base',
    price_usdc: 100,
    sale_channel: 'visby',
    platform_fee_usd: 9,
    seller_net_usd: 91,
    payout_released: false,
    payout_tx: null,
    status: 'paid',
    ...overrides,
  };
}

// --- 1. Clean matching order, visby channel (9%) — no drift -------------------------------
check(
  '1. visby channel, correct fee/net -> ok, no drift',
  reconcileOrder(baseOrder({ id: 'o1' })),
  { ok: true, expected: { platform_fee_usd: 9, seller_net_usd: 91 }, drift: [] },
);

// --- 2. Clean matching order, partner channel (3.5%) -- no drift --------------------------
check(
  '2. partner channel, correct fee/net -> ok, no drift',
  reconcileOrder(baseOrder({ id: 'o2', sale_channel: 'partner', price_usdc: 200, platform_fee_usd: 7, seller_net_usd: 193 })),
  { ok: true, expected: { platform_fee_usd: 7, seller_net_usd: 193 }, drift: [] },
);

// --- 3. Mismatched platform_fee_usd -------------------------------------------------------
{
  const r = reconcileOrder(baseOrder({ id: 'o3', platform_fee_usd: 15 }));
  check('3a. wrong platform_fee_usd -> not ok', r.ok, false);
  check('3b. wrong platform_fee_usd -> drift flags mismatch', r.drift.some((d) => d.startsWith('platform_fee_usd_mismatch')), true);
}

// --- 4. Mismatched seller_net_usd ---------------------------------------------------------
{
  const r = reconcileOrder(baseOrder({ id: 'o4', seller_net_usd: 50 }));
  check('4a. wrong seller_net_usd -> not ok', r.ok, false);
  check('4b. wrong seller_net_usd -> drift flags mismatch', r.drift.some((d) => d.startsWith('seller_net_usd_mismatch')), true);
}

// --- 5. Fee floor case: tiny order on partner channel (3.5% would be < $0.50 floor) -------
// price=$5 partner -> pct = 500*350/10000 = 17.5 -> round 18 cents; floor is 50 cents -> fee=$0.50
check(
  '5. sub-floor partner order -> floor fee $0.50, net $4.50',
  reconcileOrder(baseOrder({ id: 'o5', sale_channel: 'partner', price_usdc: 5, platform_fee_usd: 0.5, seller_net_usd: 4.5 })),
  { ok: true, expected: { platform_fee_usd: 0.5, seller_net_usd: 4.5 }, drift: [] },
);

// --- 6. Rounding tolerance: stored value off by exactly 1 cent should NOT drift -----------
check(
  '6. 1-cent-off stored fee within tolerance -> ok, no drift',
  reconcileOrder(baseOrder({ id: 'o6', platform_fee_usd: 9.01 })),
  { ok: true, expected: { platform_fee_usd: 9, seller_net_usd: 91 }, drift: [] },
);

// --- 7. payout_released=true without payout_tx -> drift -----------------------------------
{
  const r = reconcileOrder(baseOrder({ id: 'o7', payout_released: true, payout_tx: null }));
  check('7a. payout released without tx -> not ok', r.ok, false);
  check('7b. payout released without tx -> drift includes flag', r.drift.includes('payout_released_without_payout_tx'), true);
}

// --- 8. delivered order missing fee fields -> drift ---------------------------------------
{
  const r = reconcileOrder(baseOrder({ id: 'o8', status: 'delivered', platform_fee_usd: null, seller_net_usd: null }));
  check('8a. delivered order missing fee fields -> not ok', r.ok, false);
  check('8b. delivered order missing fee fields -> drift includes flag', r.drift.includes('delivered_order_missing_fee_fields'), true);
  // missing price/fee fields also trip their own missing-field flags — that's expected, not double-counted incorrectly.
  check('8c. delivered order also flags missing fee/net fields individually', r.drift.includes('platform_fee_usd_missing') && r.drift.includes('seller_net_usd_missing'), true);
}

// --- Summary -------------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('FAIL: reconcile-fees test suite has failures.');
  process.exit(1);
} else {
  console.log('PASS: all reconcile-fees assertions passed.');
}
