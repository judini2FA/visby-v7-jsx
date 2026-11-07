export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { GATED_LINKS } from '@/lib/links-config';
import { SID_COOKIE, VID_COOKIE, cleanEmail, isUuid } from '@/lib/links-hub';
import { linkVisitor, recordMatch, syncHubSpot, upsertContact } from '@/lib/links-hub-server';

// Document email gate. The document URL is only ever handed out here, after an email is recorded, so it
// never appears in the /links page source.

const SIGNED_TTL_SEC = 60 * 60;

// storage://bucket/path → short-lived signed URL. PDFs open in the browser; other formats download under
// their file name (phones can't render .docx/.xlsx inline from a raw URL reliably).
async function resolveHref(db: ReturnType<typeof createServiceClient>, href: string | null): Promise<string | null> {
  const m = href?.match(/^storage:\/\/([^/]+)\/(.+)$/);
  if (!m) return href;
  const [, bucket, path] = m;
  const download = /\.pdf$/i.test(path) ? undefined : path.split('/').pop();
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_TTL_SEC, download ? { download } : undefined);
  if (error) throw new Error(`signed url: ${error.message}`);
  return data.signedUrl;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Honeypot: real users never see this field.
  if (body.company) return NextResponse.json({ ok: true, href: null });

  const rl = await rateLimit(`links-request:${clientIp(req)}`, { limit: 20, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const doc = typeof body.doc === 'string' ? GATED_LINKS.get(body.doc) : undefined;
  if (!doc) return NextResponse.json({ error: 'Unknown document.' }, { status: 400 });
  const email = cleanEmail(body.email);
  if (!email) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  const isStudent = body.student === true;

  const jar = cookies();
  const vid = jar.get(VID_COOKIE)?.value;
  const sid = jar.get(SID_COOKIE)?.value;
  const visitorId = isUuid(vid) ? vid : null;

  let href: string | null;
  try {
    const db = createServiceClient();
    const contact = await upsertContact(db, { email, isStudent }, 'email_gate');
    if (!contact) throw new Error('contact upsert failed');

    // A visitor row exists only once the page's visit beacon has landed; don't reference one that doesn't.
    const { data: v } = visitorId ? await db.from('hub_visitors').select('id').eq('id', visitorId).maybeSingle() : { data: null };
    const linked = v ? visitorId : null;

    await db.from('hub_doc_requests').insert({ contact_id: contact.id, visitor_id: linked, doc_id: doc.id, is_student: isStudent });
    await recordMatch(db, { contactId: contact.id, visitorId: linked, sessionId: linked && isUuid(sid) ? sid : null, source: 'email_gate', evidence: 'self_reported', email });
    if (linked) await linkVisitor(db, linked, contact.id, 'self_reported');
    await syncHubSpot(email);
    href = await resolveHref(db, doc.href);
  } catch (e) {
    console.error('[links] doc request failed', (e as Error).message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, href });
}
