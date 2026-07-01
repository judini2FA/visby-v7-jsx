import { createServiceClient } from '@/lib/supabase/service';
import { captureMessage } from '@/lib/monitoring';

// Shared secret carried in the webhook URL (?secret=…). Simple + source-agnostic; upgrade to each
// vendor's native signature (Sentry-Hook-Signature / Svix) later. Fail-closed: no secret set → reject.
export function selfHealSecretOk(reqUrl: string): boolean {
  const secret = process.env.SELF_HEAL_WEBHOOK_SECRET;
  if (!secret) return false;
  try {
    return new URL(reqUrl).searchParams.get('secret') === secret;
  } catch {
    return false;
  }
}

// Records an incoming bug/support report into the triage queue. Email content is UNTRUSTED — stored as
// data, never executed. Fail-soft: a no-op (still surfaced to Sentry) if the table isn't migrated yet.
export async function recordBugReport(r: {
  source: 'sentry' | 'email';
  title?: string;
  detail?: string;
  reporter?: string;
  raw?: unknown;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('bug_reports').insert({
      source: r.source,
      title: r.title ?? null,
      detail: r.detail ?? null,
      reporter: r.reporter ?? null,
      raw: (r.raw ?? null) as any,
    });
  } catch {
    /* table not migrated yet — the captureMessage below keeps it visible */
  }
  captureMessage('warning', `bug_report:${r.source} — ${r.title ?? ''}`.slice(0, 200), { source: r.source });
}
