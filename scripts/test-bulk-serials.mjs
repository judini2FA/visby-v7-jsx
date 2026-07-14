#!/usr/bin/env node
// Manual smoke test for POST/GET /api/business/bulk-serials (business-account bulk serial logging).
// Plain Node, zero dependencies — uses the global fetch available in Node 18+.
//
// It (1) POSTs a small sample CSV (5 rows, one duplicate serial_number to prove in-request dedupe),
// (2) prints the raw response, (3) GETs the pending list back and prints a pass/fail summary.
//
// Run with --help for a step-by-step walkthrough (how to grab a Privy token from devtools, etc).

const HELP = `
test-bulk-serials.mjs — smoke test for POST/GET /api/business/bulk-serials

WHAT THIS DOES
  1. Sends a 5-row sample CSV to POST /api/business/bulk-serials (one row is a duplicate
     serial_number of another row, on purpose, to prove the route ignores in-request dupes).
  2. Prints the JSON response.
  3. GETs the pending-serials list back for your wallet and prints a PASS/FAIL summary
     (expects: 4 inserted, 1 dupe ignored).

REQUIREMENTS
  - Your account must be a BUSINESS account (Profile → Settings → Account type). The route
    returns 403 for a personal account.
  - A valid Privy auth token for that account (short-lived — grab a fresh one if you get 401).
  - The wallet address linked to that Privy account.

STEP-BY-STEP: GETTING A PRIVY TOKEN
  1. Open the Visby app in your browser and make sure you're logged in on a BUSINESS account.
  2. Open DevTools (Cmd+Opt+I / F12).
  3. Easiest — Network tab:
       - Reload the page, or click around (e.g. open /dashboard/seller).
       - Click any request to this app's own API (path starts with /api/).
       - In Headers → Request Headers, find "Authorization: Bearer <long token>".
       - Copy everything AFTER "Bearer " — that's PRIVY_TOKEN.
  4. Alternative — Application tab:
       - Application → Local Storage → this site's origin.
       - Look for a Privy-managed key holding a JWT-looking value (starts with "eyJ").
       - Copy the value — that's PRIVY_TOKEN.
  5. Get your wallet address from Profile → Wallet tab (or the address-book /login flow) —
     that's VISBY_WALLET.

USAGE
  PRIVY_TOKEN=eyJ... VISBY_WALLET=<your-wallet-address> node scripts/test-bulk-serials.mjs

  Optional:
    VISBY_ORIGIN=https://your-deployment.vercel.app   (default: http://localhost:3000)

  --help / -h    Show this message and exit.
`;

function printHelpAndExit(code) {
  console.log(HELP);
  process.exit(code);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelpAndExit(0);
}

const VISBY_ORIGIN = (process.env.VISBY_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
const PRIVY_TOKEN = process.env.PRIVY_TOKEN || '';
const VISBY_WALLET = process.env.VISBY_WALLET || '';

if (!PRIVY_TOKEN || !VISBY_WALLET) {
  console.error('Missing required env vars.\n');
  console.error(`  PRIVY_TOKEN:  ${PRIVY_TOKEN ? 'set' : 'MISSING'}`);
  console.error(`  VISBY_WALLET: ${VISBY_WALLET ? 'set' : 'MISSING'}`);
  console.error('\nRun with --help for instructions on how to grab these.\n');
  process.exit(1);
}

// Column order the route expects, mirrored from src/app/api/business/bulk-serials/route.ts.
const CSV_COLUMNS = ['serial_number', 'name', 'category', 'condition', 'description', 'image_url', 'brand', 'price_usdc'];

// Unique per run so re-running this script doesn't collide with a previous run's rows in the DB
// (the route's DB-level upsert would silently skip a serial it already saw, which would muddy the
// "1 dupe ignored" signal this script is trying to demonstrate).
const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const serials = [1, 2, 3, 4].map(n => `TESTBULK-${runId}-${n}`);

function csvRow(fields) {
  return fields
    .map(f => {
      const s = String(f ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}

const rows = [
  [serials[0], 'Test Bulk Item 1', 'sneakers', 'used', 'Bulk-logging smoke test row 1', '', 'TestBrand', '25.00'],
  [serials[1], 'Test Bulk Item 2', 'watches', 'new', 'Bulk-logging smoke test row 2', '', 'TestBrand', '120.00'],
  [serials[2], 'Test Bulk Item 3', 'bags', 'used', 'Bulk-logging smoke test row 3', '', 'TestBrand', '60.00'],
  [serials[3], 'Test Bulk Item 4', 'sneakers', 'new', 'Bulk-logging smoke test row 4', '', 'TestBrand', '45.00'],
  // Intentional duplicate serial_number (row 1 again) to prove in-request dedupe.
  [serials[0], 'Test Bulk Item 1 (duplicate)', 'sneakers', 'used', 'Should be ignored as a dupe', '', 'TestBrand', '25.00'],
];

const csv = [csvRow(CSV_COLUMNS), ...rows.map(csvRow)].join('\n');

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${PRIVY_TOKEN}`,
  };
}

async function main() {
  console.log(`\nPOST ${VISBY_ORIGIN}/api/business/bulk-serials`);
  console.log(`wallet: ${VISBY_WALLET}`);
  console.log(`sample serials (this run): ${serials.join(', ')}\n`);

  let postJson;
  try {
    const postRes = await fetch(`${VISBY_ORIGIN}/api/business/bulk-serials`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ wallet: VISBY_WALLET, csv }),
    });
    postJson = await postRes.json().catch(() => ({}));
    console.log(`Response (${postRes.status}):`);
    console.log(JSON.stringify(postJson, null, 2));

    if (postRes.status === 401) {
      console.error('\n401 Unauthorized — your PRIVY_TOKEN is likely missing/expired, or VISBY_WALLET');
      console.error('is not one of the wallets linked to that Privy account. Grab a fresh token (--help).');
      process.exit(1);
    }
    if (postRes.status === 403) {
      console.error('\n403 Forbidden — bulk serial logging requires a BUSINESS account. Switch the');
      console.error('account type in Profile → Settings and try again.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`\nRequest failed: ${err?.message || err}`);
    console.error(`Is the app running at ${VISBY_ORIGIN}? (npm run dev, or set VISBY_ORIGIN).`);
    process.exit(1);
  }

  console.log(`\nGET ${VISBY_ORIGIN}/api/business/bulk-serials?wallet=...`);
  let getJson;
  try {
    const getRes = await fetch(
      `${VISBY_ORIGIN}/api/business/bulk-serials?wallet=${encodeURIComponent(VISBY_WALLET)}`,
      { headers: authHeaders() }
    );
    getJson = await getRes.json().catch(() => ({}));
    if (!getRes.ok) {
      console.error(`GET failed (${getRes.status}):`, JSON.stringify(getJson, null, 2));
      process.exit(1);
    }
  } catch (err) {
    console.error(`\nGET request failed: ${err?.message || err}`);
    process.exit(1);
  }

  const pendingRows = Array.isArray(getJson.rows) ? getJson.rows : [];
  const foundThisRun = pendingRows.filter(r => serials.includes(r.serial_number));

  console.log(`\nPending list has ${pendingRows.length} total row(s); ${foundThisRun.length} from this run.`);

  const inserted = postJson?.inserted ?? -1;
  const errors = Array.isArray(postJson?.errors) ? postJson.errors : [];
  const dupeErrorCount = errors.filter(e => /duplicate/i.test(e)).length;

  const expectInserted = inserted === 4;
  const expectDupeIgnored = dupeErrorCount === 1;
  const expectFoundInPending = foundThisRun.length === 4;

  console.log('\n--- Summary ---');
  console.log(`Inserted:            ${inserted} ${expectInserted ? '(expected: 4) OK' : '(expected: 4) MISMATCH'}`);
  console.log(`Dupe(s) ignored:     ${dupeErrorCount} ${expectDupeIgnored ? '(expected: 1) OK' : '(expected: 1) MISMATCH'}`);
  console.log(`Confirmed in pending:${' '}${foundThisRun.length}/4 ${expectFoundInPending ? 'OK' : 'MISMATCH'}`);

  const pass = expectInserted && expectDupeIgnored && expectFoundInPending;
  console.log(`\n${pass ? 'PASS' : 'FAIL'}: ${pass ? '4 inserted, 1 dupe ignored, all confirmed pending.' : 'see mismatches above.'}\n`);
  process.exit(pass ? 0 : 1);
}

main();
