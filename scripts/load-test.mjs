// scripts/load-test.mjs — blueprint 11.5
//
// Tiny, dependency-free load tester for Visby's PUBLIC READ endpoints only. Fires GET requests
// at a single path for a fixed duration at a fixed concurrency, then prints throughput, error
// rate, and p50/p95/p99 latency. Built-in `fetch` + a fixed pool of async workers — no new deps.
//
// ┌───────────────────────────────────────────────────────────────────────────────────────────┐
// │  SAFE-DEFAULT WARNING — NEVER run this against production (visby.me / any live deployment).  │
// │  This generates sustained synthetic traffic. Point it ONLY at a local dev server            │
// │  (http://localhost:3000) or a throwaway staging box you own and are allowed to hammer.      │
// │  As a guardrail this script REFUSES to run against a host that looks like production unless  │
// │  you pass --i-know-this-is-not-prod. Even then: do not aim it at prod. Concurrency default   │
// │  is intentionally LOW (10). Hit only PUBLIC, read-only, side-effect-free endpoints — never a │
// │  route that writes, pays, mints, mutates, or requires auth.                                  │
// └───────────────────────────────────────────────────────────────────────────────────────────┘
//
// Usage:
//   node scripts/load-test.mjs [--url <base>] [--path <path>] [--concurrency <n>] [--duration <s>]
//
// Flags (all optional):
//   --url          Base URL of the target.        default: http://localhost:3000
//   --path         Public read path to hit.        default: /api/legal
//   --concurrency  In-flight requests (workers).   default: 10   (kept low on purpose)
//   --duration     Test length in seconds.         default: 15
//   --timeout      Per-request timeout in ms.      default: 10000
//   --i-know-this-is-not-prod   Escape hatch to allow a non-localhost host. Still: not for prod.
//   --help         Print this usage and exit.
//
// Examples:
//   node scripts/load-test.mjs
//   node scripts/load-test.mjs --path /api/health --concurrency 20 --duration 30
//   node scripts/load-test.mjs --url http://localhost:3000 --path /item/some-id
//
// Good PUBLIC read targets on Visby (side-effect-free GETs):
//   /api/legal            legal-doc URLs (default; no auth, no writes)
//   /api/health           liveness + config-presence booleans
//   /                     home "Market Square" listings page (HTML)
//   /item/<id>            an item detail page (HTML)
//
// Exit code: 0 if the run completed and the error rate stayed under --max-error-rate (default 0.10),
// non-zero otherwise — so CI can gate on it.

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsageAndExit(0);
}

const BASE = String(args.url ?? 'http://localhost:3000').replace(/\/+$/, '');
const PATH = normalizePath(String(args.path ?? '/api/legal'));
const CONCURRENCY = clampInt(args.concurrency, 10, 1, 1000);
const DURATION_S = clampInt(args.duration, 15, 1, 3600);
const TIMEOUT_MS = clampInt(args.timeout, 10000, 100, 120000);
const MAX_ERROR_RATE = clampFloat(args['max-error-rate'], 0.1, 0, 1);
const ALLOW_NON_PROD = Boolean(args['i-know-this-is-not-prod']);

let target;
try {
  target = new URL(BASE + PATH);
} catch {
  console.error(`FATAL: could not parse target URL from --url "${BASE}" + --path "${PATH}".`);
  process.exit(2);
}

if (target.protocol !== 'http:' && target.protocol !== 'https:') {
  console.error(`FATAL: unsupported protocol "${target.protocol}". Use http/https.`);
  process.exit(2);
}

// --- Production guardrail --------------------------------------------------------------------
// Refuse anything that isn't obviously a local/loopback host unless the operator explicitly
// acknowledges it is NOT production. This is a blunt safety net, not a substitute for judgment.
const host = target.hostname.toLowerCase();
const isLocal =
  host === 'localhost' ||
  host === '0.0.0.0' ||
  host === '::1' ||
  host.endsWith('.localhost') ||
  host.startsWith('127.') ||
  host.startsWith('192.168.') ||
  host.startsWith('10.') ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(host);

const looksLikeProd = /(^|\.)visby\.me$/.test(host) || /(^|\.)visby\.(app|com|io)$/.test(host);

if (looksLikeProd) {
  console.error(
    `FATAL: "${host}" looks like Visby production. This script must NEVER be run against production.\n` +
      `Point --url at http://localhost:3000 instead. Refusing to run.`,
  );
  process.exit(2);
}
if (!isLocal && !ALLOW_NON_PROD) {
  console.error(
    `REFUSING: "${host}" is not a local/loopback host.\n` +
      `Load-testing a remote host can look like an attack and can take a service down.\n` +
      `If this is a throwaway box you own and are allowed to hammer (and it is NOT production),\n` +
      `re-run with --i-know-this-is-not-prod. Otherwise, target localhost.`,
  );
  process.exit(2);
}

// --- Run -------------------------------------------------------------------------------------
const latencies = []; // ms, successful responses only
let ok = 0;
let failed = 0;
const statusCounts = new Map();
const errorKinds = new Map();

const url = target.href;
const deadline = Date.now() + DURATION_S * 1000;

console.log(`Visby load test — PUBLIC read only`);
console.log(`  target:      ${url}`);
console.log(`  concurrency: ${CONCURRENCY}`);
console.log(`  duration:    ${DURATION_S}s`);
console.log(`  timeout:     ${TIMEOUT_MS}ms`);
console.log(`  (never run this against production)`);
console.log('');

async function worker() {
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'visby-load-test/1.0 (read-only)', accept: '*/*' },
      });
      // Drain the body so the connection can be reused and timing reflects a full response.
      await res.arrayBuffer().catch(() => {});
      const elapsed = performance.now() - started;
      bump(statusCounts, res.status);
      // Treat 5xx (and network-level failures below) as errors; 2xx/3xx/4xx are "served".
      if (res.status >= 500) {
        failed++;
      } else {
        ok++;
        latencies.push(elapsed);
      }
    } catch (err) {
      failed++;
      bump(errorKinds, errorLabel(err));
    } finally {
      clearTimeout(timer);
    }
  }
}

const wallStart = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const wallMs = performance.now() - wallStart;

// --- Report ----------------------------------------------------------------------------------
const total = ok + failed;
const wallSec = wallMs / 1000;
const rps = wallSec > 0 ? total / wallSec : 0;
const errorRate = total > 0 ? failed / total : 0;

console.log('Results');
console.log(`  requests:    ${total} total  (${ok} ok, ${failed} error)`);
console.log(`  throughput:  ${rps.toFixed(1)} req/s`);
console.log(`  error rate:  ${(errorRate * 100).toFixed(2)}%`);

if (latencies.length > 0) {
  latencies.sort((a, b) => a - b);
  const p = (q) => percentile(latencies, q);
  console.log(
    `  latency ms:  p50 ${fmt(p(50))}  p95 ${fmt(p(95))}  p99 ${fmt(p(99))}  ` +
      `(min ${fmt(latencies[0])}, max ${fmt(latencies[latencies.length - 1])})`,
  );
} else {
  console.log(`  latency ms:  n/a (no successful responses)`);
}

if (statusCounts.size > 0) {
  console.log(`  status:      ${[...statusCounts.entries()].sort((a, b) => a[0] - b[0]).map(([s, c]) => `${s}×${c}`).join('  ')}`);
}
if (errorKinds.size > 0) {
  console.log(`  errors:      ${[...errorKinds.entries()].map(([k, c]) => `${k}×${c}`).join('  ')}`);
}

console.log('');
if (total === 0) {
  console.error('FAIL: zero requests completed — is the dev server running at the target URL?');
  process.exit(1);
}
if (errorRate > MAX_ERROR_RATE) {
  console.error(`FAIL: error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(MAX_ERROR_RATE * 100).toFixed(2)}%.`);
  process.exit(1);
}
console.log('PASS: load test completed within the error-rate threshold.');
process.exit(0);

// --- helpers ---------------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const eq = key.indexOf('=');
    if (eq !== -1) {
      out[key.slice(0, eq)] = key.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    // A bare flag (no following value, or the next token is itself a flag) is treated as boolean true.
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function normalizePath(p) {
  if (!p) return '/';
  return p.startsWith('/') ? p : '/' + p;
}

function clampInt(v, dflt, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(v, dflt, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

// fetch() surfaces connection failures as a generic TypeError whose real code lives on `.cause`
// (e.g. ECONNREFUSED, ENOTFOUND). Dig it out so the report says something actionable.
function errorLabel(err) {
  if (err && err.name === 'AbortError') return 'timeout';
  if (err && err.code) return err.code;
  if (err && err.cause && err.cause.code) return err.cause.code;
  return (err && err.name) || 'error';
}

// Nearest-rank percentile on an already-ascending array. q in [0,100].
function percentile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const rank = Math.ceil((q / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

function fmt(ms) {
  return Number.isFinite(ms) ? ms.toFixed(1) : 'n/a';
}

function printUsageAndExit(code) {
  console.log(
    [
      'Visby load test (PUBLIC read endpoints only — NEVER run against production)',
      '',
      'Usage:',
      '  node scripts/load-test.mjs [--url <base>] [--path <path>] [--concurrency <n>] [--duration <s>]',
      '',
      'Flags:',
      '  --url          Base URL.                default: http://localhost:3000',
      '  --path         Public read path.        default: /api/legal',
      '  --concurrency  In-flight requests.      default: 10',
      '  --duration     Seconds to run.          default: 15',
      '  --timeout      Per-request ms.          default: 10000',
      '  --max-error-rate  Fail threshold 0..1.  default: 0.10',
      '  --i-know-this-is-not-prod   Allow a non-localhost host (still never prod).',
      '  --help         Show this help.',
    ].join('\n'),
  );
  process.exit(code);
}
