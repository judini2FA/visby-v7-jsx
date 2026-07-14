// Central place to turn any caught error/rejection into a plain-English,
// user-safe sentence. Never surfaces stack traces, raw JSON, 'undefined',
// '[object Object]', or Postgres/Supabase internals — those always fall
// back to the caller-supplied copy instead.

type Rule = { test: RegExp; message: string };

const JUNK_LITERALS = new Set([
  'undefined',
  'null',
  '[object object]',
  'object object',
  'error',
  'failed',
  'fail',
  'unknown',
  'unknown error',
  'internal server error',
  'bad request',
  'not found',
  '{}',
  '[]',
]);

// Order matters — first match wins.
const RULES: Rule[] = [
  {
    test: /failed to fetch|network\s*error|network request failed|load failed|err_internet_disconnected|err_network|econnrefused|enotfound|fetch failed|internet connection appears to be offline|no internet/i,
    message: 'Connection problem — check your internet and try again.',
  },
  {
    test: /\b401\b|\b403\b|unauthorized|forbidden|not authenticated|not signed in|no active session|invalid session|session expired|session has expired/i,
    message: 'Please sign in again.',
  },
  {
    test: /\b429\b|too many requests|too many attempts|rate limit(ed)?/i,
    message: 'Too many attempts — wait a moment and try again.',
  },
  {
    test: /user rejected|rejected the request|request rejected|user denied|denied the transaction|user cancelled|user canceled|\b4001\b/i,
    message: 'Request cancelled in your wallet.',
  },
  {
    test: /insufficient funds|insufficient balance|insufficient lamports|not enough (funds|balance)/i,
    message: 'Insufficient funds to complete this transaction.',
  },
  {
    test: /invalid.*(otp|verification code)|(otp|verification code|code).*(invalid|incorrect|expired)|wrong code|code has expired|expired code|incorrect code/i,
    message: 'That code is incorrect or has expired — request a new one.',
  },
  {
    test: /timed out|timeout exceeded|deadline exceeded/i,
    message: 'That took too long — check your connection and try again.',
  },
];

function extractMessage(e: unknown): string {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || '';
  if (typeof e === 'object') {
    const anyE = e as Record<string, unknown>;
    if (typeof anyE.message === 'string') return anyE.message;
    if (typeof anyE.error === 'string') return anyE.error;
    if (anyE.error && typeof (anyE.error as any).message === 'string') return (anyE.error as any).message;
    if (typeof anyE.reason === 'string') return anyE.reason;
    if (typeof anyE.statusText === 'string' && anyE.statusText) return anyE.statusText;
  }
  return '';
}

function looksLikeStackTrace(msg: string): boolean {
  return (
    /\bat\s+\S+\s*\(.*:\d+:\d+\)/.test(msg) ||
    /\.(js|ts|tsx|jsx):\d+:\d+/.test(msg) ||
    /webpack-internal|node_modules\//.test(msg) ||
    msg.split('\n').length > 3
  );
}

function looksLikeRawJSON(msg: string): boolean {
  const t = msg.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      JSON.parse(t);
      return true;
    } catch {
      // fall through to heuristic below
    }
  }
  return /"[a-zA-Z_]+"\s*:\s*"/.test(t) && t.length > 40;
}

function looksLikeDbError(msg: string): boolean {
  return /violates (row-level security|unique|foreign key|check) constraint|duplicate key value|relation "[^"]+" does not exist|column "[^"]+" does not exist|syntax error at or near|PGRST\d+|permission denied for (table|relation|schema)|^[0-9A-Z]{5}$/i.test(
    msg
  );
}

/**
 * Extracts a human-readable message from an unknown error/rejection.
 * Known patterns (network, auth, rate limit, wallet rejection, funds,
 * OTP, timeout) are mapped to fixed plain-English copy. Anything that
 * looks like a stack trace, raw JSON, or a Postgres/Supabase error code
 * falls back to `fallback`. A short, already-readable message is passed
 * through untouched. Always returns a non-empty sentence — never
 * 'undefined', '[object Object]', or raw internals.
 */
export function friendlyError(e: unknown, fallback: string): string {
  const fb = fallback && fallback.trim() ? fallback.trim() : 'Something went wrong — please try again.';
  const raw = extractMessage(e).trim();

  if (!raw || JUNK_LITERALS.has(raw.toLowerCase())) return fb;

  for (const rule of RULES) {
    if (rule.test.test(raw)) return rule.message;
  }

  if (looksLikeStackTrace(raw) || looksLikeRawJSON(raw) || looksLikeDbError(raw)) return fb;

  // Guard against overly long or markup-ish blobs that slipped through.
  if (raw.length > 160 || /[{}<>]/.test(raw)) return fb;

  return /[.!?]$/.test(raw) ? raw : `${raw}.`;
}
