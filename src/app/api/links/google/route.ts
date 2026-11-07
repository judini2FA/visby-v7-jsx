export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createServiceClient } from '@/lib/supabase/service';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { SID_COOKIE, VID_COOKIE, cleanEmail, isUuid } from '@/lib/links-hub';
import { linkVisitor, recordMatch, syncHubSpot, upsertContact } from '@/lib/links-hub-server';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// Google One Tap credential → verified email. The ID token is verified here (signature, issuer, audience,
// expiry); nothing from the client is trusted until it passes.
export async function POST(req: Request) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'Not configured' }, { status: 404 });

  const rl = await rateLimit(`links-google:${clientIp(req)}`, { limit: 10, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const body = await req.json().catch(() => ({})) as { credential?: unknown };
  if (typeof body.credential !== 'string' || body.credential.length > 4096) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  let email: string | null;
  let name: string | null;
  try {
    const { payload } = await jwtVerify(body.credential, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    });
    if (payload.email_verified !== true) return NextResponse.json({ error: 'Unverified email' }, { status: 400 });
    email = cleanEmail(payload.email);
    name = typeof payload.name === 'string' ? payload.name.slice(0, 160) : null;
  } catch {
    return NextResponse.json({ error: 'Invalid credential' }, { status: 401 });
  }
  if (!email) return NextResponse.json({ error: 'Invalid credential' }, { status: 401 });

  const jar = cookies();
  const vid = jar.get(VID_COOKIE)?.value;
  const sid = jar.get(SID_COOKIE)?.value;

  const db = createServiceClient();
  const contact = await upsertContact(db, { email, name }, 'google');
  if (!contact) return NextResponse.json({ error: 'Could not save' }, { status: 500 });

  const visitorId = isUuid(vid) ? vid : null;
  await recordMatch(db, { contactId: contact.id, visitorId, sessionId: isUuid(sid) ? sid : null, source: 'google', evidence: 'authenticated', email });
  if (visitorId) await linkVisitor(db, visitorId, contact.id, 'authenticated');
  await syncHubSpot({ email, name, company: contact.company, title: contact.title, source: 'google' });

  return NextResponse.json({ ok: true, name: name?.split(' ')[0] ?? null });
}
