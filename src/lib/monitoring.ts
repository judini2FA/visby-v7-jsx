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

export function captureError(err: unknown, ctx?: Ctx): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[capture]', message, ctx ?? {});
  void forward('error', message, { ...ctx, stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined });
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
