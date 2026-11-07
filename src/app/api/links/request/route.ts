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
  } catch (e) {
    console.error('[links] doc request failed', (e as Error).message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, href: doc.href });
}
