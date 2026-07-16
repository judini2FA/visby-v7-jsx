// Provider-agnostic error capture — fail-soft, no heavy SDK. captureError/captureMessage ALWAYS log to
// the console with structured context (so nothing is lost), and when SENTRY_DSN or ALERT_WEBHOOK_URL is
// configured they additionally forward a minimal payload via fetch. The forwarder is fully swallowed —
// monitoring can never throw into or slow down a money path.

type Level = 'error' | 'warning' | 'info';
type Ctx = Record<string, unknown>;

const SENTRY_DSN = process.env.SENTRY_DSN;
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

export function monitoringConfigured(): boolean {
  return !!(SENTRY_DSN || ALERT_WEBHOOK_URL);
}

// Extracts a real message from anything callers pass — an Error, a Supabase PostgrestError (plain
// object with .message/.code/.details, NOT instanceof Error), or a stray string/primitive. Without this,
// `String(plainObject)` silently produces the literal text "[object Object]", turning every DB-error
// alert (mint insert failures, payout errors, order creation, etc.) into a useless, undiagnosable title.
function describeError(err: unknown): { message: string; extra?: Ctx } {
  if (err instanceof Error) return { message: err.message };
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const message = typeof e.message === 'string' && e.message ? e.message : JSON.stringify(err);
    const extra: Ctx = {};
    if (typeof e.code === 'string') extra.error_code = e.code;
    if (typeof e.details === 'string') extra.error_details = e.details;
    if (typeof e.hint === 'string') extra.error_hint = e.hint;
    return { message, extra: Object.keys(extra).length ? extra : undefined };
  }
  return { message: String(err) };
}

export function captureError(err: unknown, ctx?: Ctx): void {
  const { message, extra } = describeError(err);
  console.error('[capture]', message, ctx ?? {});
  void forward('error', message, { ...ctx, ...extra, stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined });
}

export function captureMessage(level: Level, msg: string, ctx?: Ctx): void {
  (level === 'error' ? console.error : level === 'warning' ? console.warn : console.log)('[capture]', msg, ctx ?? {});
  void forward(level, msg, ctx);
}

async function forward(level: Level, message: string, ctx?: Ctx): Promise<void> {
  try {
    if (SENTRY_DSN) return await toSentry(level, message, ctx);
    if (ALERT_WEBHOOK_URL) return await toWebhook(level, message, ctx);
  } catch {
    // Never let a monitoring sink failure surface — it already hit the console above.
  }
}

// Minimal Sentry "store" envelope (no @sentry/* SDK). DSN = https://<publicKey>@<host>/<projectId>.
async function toSentry(level: Level, message: string, ctx?: Ctx): Promise<void> {
  const m = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(SENTRY_DSN ?? '');
  if (!m) return;
  const [, key, host, projectId] = m;
  await fetch(`https://${host}/api/${projectId}/store/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}` },
    body: JSON.stringify({ message, level, platform: 'node', timestamp: new Date().toISOString(), server_name: 'visby', extra: ctx ?? {} }),
  });
}

// Generic alert webhook — sends both `text` (Slack) and `content` (Discord) so either works.
async function toWebhook(level: Level, message: string, ctx?: Ctx): Promise<void> {
  const text = `[${level}] ${message}${ctx ? `\n${JSON.stringify(ctx)}` : ''}`;
  await fetch(ALERT_WEBHOOK_URL as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, content: text }),
  });
}
