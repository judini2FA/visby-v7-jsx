export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { selfHealSecretOk, recordBugReport } from '@/lib/bug-intake';

// Sentry alert webhook → records the error into the self-healing triage queue. Verified by a shared
// secret in the URL. The auto-fix-to-PR step runs OUTSIDE this route (needs a GitHub token + a Claude
// runner) and reads 'open' rows; this route is just the durable, trusted intake.
export async function POST(req: Request) {
  if (!selfHealSecretOk(req.url)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = await req.text();
  let event: any;
  try { event = JSON.parse(raw); } catch { event = { raw }; }

  const data = event?.data?.event ?? event?.data ?? event ?? {};
  const title = data?.title ?? data?.metadata?.value ?? data?.message ?? 'Sentry error';
  const culprit = data?.culprit ?? data?.transaction ?? data?.metadata?.filename ?? '';

  await recordBugReport({
    source: 'sentry',
    title: String(title).slice(0, 300),
    detail: String(culprit).slice(0, 1000),
    reporter: 'sentry',
    raw: event,
  });
  return NextResponse.json({ ok: true });
}
