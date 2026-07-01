export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { selfHealSecretOk, recordBugReport } from '@/lib/bug-intake';

// Inbound help-email webhook (e.g. Resend inbound routing) → records the message as an UNTRUSTED support
// ticket in the triage queue. Verified by a shared secret in the URL. The email body is DATA, never
// instructions: any resulting fix is proposed as a reviewed PR by the separate automation, which
// reproduces the reported bug independently before touching code.
export async function POST(req: Request) {
  if (!selfHealSecretOk(req.url)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = await req.text();
  let msg: any;
  try { msg = JSON.parse(raw); } catch { msg = { raw }; }

  const from = msg?.from ?? msg?.sender ?? msg?.envelope?.from ?? 'unknown';
  const subject = msg?.subject ?? '(no subject)';
  const text = msg?.text ?? msg?.body ?? msg?.html ?? '';

  await recordBugReport({
    source: 'email',
    title: String(subject).slice(0, 300),
    detail: String(text).slice(0, 4000),
    reporter: String(from).slice(0, 200),
    raw: msg,
  });
  return NextResponse.json({ ok: true });
}
