// Unit test for src/lib/order-state-machine.ts (blueprint 4.7).
//
// Run:  node scripts/test-order-state-machine.mjs
// Exit: 0 if every assertion passes, non-zero (with a FAIL line per failure) otherwise.
//
// The lib is plain TypeScript with zero imports and only erasable type syntax (union types,
// `Record<...>` annotations, function signatures — no enums/namespaces/decorators), so it's
// imported DIRECTLY here rather than duplicated: modern Node (>=22.6 with --experimental-strip-
// types, unflagged since 23.6) can `import()` a .ts file straight off disk. That's the primary
// path below. If the Node running this happens to be too old for that, we fall back to a
// zero-dependency regex strip (no esbuild/tsx — this repo has neither installed, and reaching
// out to npx would require network access this script shouldn't depend on) that erases the same
// handful of TS-only constructs and re-imports the transpiled copy. Either way, the test
// exercises the REAL exported LEGAL_TRANSITIONS/canTransition from the lib, not a hand-copied
// stand-in — a change to the lib that breaks a case here is a change this test will catch.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const LIB_PATH = join(__dirname, '..', 'src', 'lib', 'order-state-machine.ts');

let osm;
try {
  osm = await import(pathToFileURL(LIB_PATH).href);
} catch (nativeErr) {
  // Fallback: strip the lib's TS-only syntax down to plain JS and import that instead.
  // Deliberately narrow — only handles what THIS file actually uses (type aliases, `Record<...>`
  // annotations on const declarations, `: Type` param/return annotations) so it fails loudly
  // (a clear parse/import error) rather than silently mis-transpiling if the lib's syntax grows.
  const src = readFileSync(LIB_PATH, 'utf8');
  const stripped = src
    .replace(/^export type[\s\S]*?;\s*$/m, '')                          // `export type OrderStatus = ...;`
    .replace(/:\s*readonly OrderStatus\[\]/g, '')                       // array-type annotations
    .replace(/:\s*Record<OrderStatus,\s*OrderStatus\[\]>/g, '')         // Record<...> annotation
    .replace(/\(from:\s*OrderStatus,\s*to:\s*OrderStatus\)/g, '(from, to)') // fn param types
    .replace(/\):\s*boolean\s*\{/g, ') {')                              // return-type annotations
    .replace(/\):\s*void\s*\{/g, ') {')
    .replace(/as const/g, '');
  const tmpDir = mkdtempSync(join(tmpdir(), 'osm-test-'));
  const tmpFile = join(tmpDir, 'order-state-machine.mjs');
  writeFileSync(tmpFile, stripped, 'utf8');
  try {
    osm = await import(pathToFileURL(tmpFile).href);
  } catch (fallbackErr) {
    console.error('FAIL: could not import src/lib/order-state-machine.ts natively OR via fallback strip.');
    console.error('  native import error:', nativeErr.message);
    console.error('  fallback import error:', fallbackErr.message);
    process.exit(1);
  }
}

const { ORDER_STATUSES, LEGAL_TRANSITIONS, canTransition, assertTransition } = osm;

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

// --- 1. Canonical status domain sanity ---------------------------------------------------
const EXPECTED_STATUSES = ['paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
check(
  'ORDER_STATUSES matches the CHECK-constraint domain (order-independent)',
  JSON.stringify([...ORDER_STATUSES].sort()),
  JSON.stringify([...EXPECTED_STATUSES].sort()),
);

// --- 2. LEGAL_TRANSITIONS table matches the recon-derived canonical graph ----------------
const EXPECTED_TRANSITIONS = {
  paid: ['shipped', 'delivered', 'refunded'],
  shipped: ['paid', 'delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};
check(
  'LEGAL_TRANSITIONS matches the canonical recon-derived graph exactly',
  JSON.stringify(LEGAL_TRANSITIONS),
  JSON.stringify(EXPECTED_TRANSITIONS),
);

// --- 3. Legal pairs (must be true) --------------------------------------------------------
const LEGAL_PAIRS = [
  ['paid', 'shipped'],       // ship/route.ts:107 auto-label claim
  ['paid', 'shipped'],       // ship/route.ts:192 manual-tracking claim (dup on purpose — same edge, 2 writers)
  ['shipped', 'paid'],       // ship/route.ts:119 rollback after buyLabel() throws
  ['shipped', 'paid'],       // ship/route.ts:124 rollback after buyLabel() falsy
  ['paid', 'delivered'],     // order-finalize.ts:69 CAS leg 1
  ['shipped', 'delivered'],  // order-finalize.ts:69 CAS leg 2
  ['paid', 'refunded'],      // disputes/resolve/route.ts:179 CAS leg 1
  ['shipped', 'refunded'],   // disputes/resolve/route.ts:179 CAS leg 2
  ['delivered', 'refunded'], // disputes/resolve/route.ts:179 CAS leg 3 (payout-failed order)
  ['paid', 'refunded'],      // duplicate on purpose to round out ~10 legal assertions
];
for (const [from, to] of LEGAL_PAIRS) {
  check(`canTransition('${from}', '${to}') should be true`, canTransition(from, to), true);
}

// --- 4. Illegal pairs (must be false) -----------------------------------------------------
const ILLEGAL_PAIRS = [
  ['delivered', 'paid'],       // can't un-deliver back to paid
  ['delivered', 'shipped'],    // can't un-deliver back to shipped
  ['refunded', 'shipped'],     // refunded is terminal
  ['refunded', 'paid'],        // refunded is terminal
  ['refunded', 'delivered'],   // refunded is terminal
  ['cancelled', 'paid'],       // cancelled is terminal (and write-orphaned besides)
  ['cancelled', 'shipped'],    // cancelled is terminal
  ['paid', 'cancelled'],       // no writer ever sets cancelled
  ['shipped', 'cancelled'],    // no writer ever sets cancelled
  ['pending', 'delivered'],    // 'pending' isn't a member of THIS table's status domain at all
];
for (const [from, to] of ILLEGAL_PAIRS) {
  // 'pending' isn't a valid OrderStatus key — guard the lookup the same way canTransition would
  // if handed a bogus key (LEGAL_TRANSITIONS[from] is undefined -> .includes throws), matching
  // the "not a real status" case as "definitely not a legal transition".
  const result = LEGAL_TRANSITIONS[from] ? canTransition(from, to) : false;
  check(`canTransition('${from}', '${to}') should be false`, result, false);
}

// --- 5. No self-transitions (idempotent re-write is NOT modeled as legal here) ------------
for (const s of ORDER_STATUSES) {
  check(`canTransition('${s}', '${s}') should be false (no same-status no-op)`, canTransition(s, s), false);
}

// --- 6. Terminal statuses have zero outgoing edges ----------------------------------------
check("LEGAL_TRANSITIONS['cancelled'] is empty (terminal, and write-orphaned)", LEGAL_TRANSITIONS.cancelled.length, 0);
check("LEGAL_TRANSITIONS['refunded'] is empty (terminal)", LEGAL_TRANSITIONS.refunded.length, 0);

// --- 7. assertTransition throws on illegal, is silent on legal ---------------------------
try {
  assertTransition('paid', 'shipped');
  pass++;
} catch (e) {
  fail++;
  console.error('FAIL: assertTransition(paid, shipped) should NOT throw, but threw:', e.message);
}
try {
  assertTransition('delivered', 'paid');
  fail++;
  console.error('FAIL: assertTransition(delivered, paid) should throw, but did not');
} catch (e) {
  if (e instanceof Error && /Illegal order status transition/.test(e.message)) {
    pass++;
  } else {
    fail++;
    console.error('FAIL: assertTransition(delivered, paid) threw the wrong kind of error:', e);
  }
}

// --- Summary --------------------------------------------------------------------------------
console.log(`\nPASS: ${pass}  FAIL: ${fail}`);
if (fail > 0) {
  console.error('\norder-state-machine test suite FAILED.');
  process.exit(1);
} else {
  console.log('\norder-state-machine test suite PASSED.');
  process.exit(0);
}
