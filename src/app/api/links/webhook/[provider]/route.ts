export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { inviteTokenFromUrl, normalizeProvider, safeEqual } from '@/lib/links-hub';
import { recordMatch, syncHubSpot, upsertContact } from '@/lib/links-hub-server';

// RB2B and Warmly deliver identified visitors here. Neither vendor signs webhooks; both document putting
// auth in the destination URL's query string, so the endpoint is configured as
// https://visby.me/api/links/webhook/<provider>?key=<SECRET>. An unset secret disables the provider.
const SECRETS: Record<string, string | undefined> = {
  rb2b: process.env.RB2B_WEBHOOK_SECRET,
  warmly: process.env.WARMLY_WEBHOOK_SECRET,
};

// Vendor payloads carry chat transcripts / AI-generated sequences we have no use for; don't retain them.
const DROP_KEYS = ['chatLog', 'generatedEmailSequence', 'inboundCollectedFields'];

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider === 'rb2b' || params.provider === 'warmly' ? params.provider : null;
  const secret = provider ? SECRETS[provider] : undefined;
  if (!provider || !secret) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!safeEqual(new URL(req.url).searchParams.get('key') ?? '', secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const items: Record<string, unknown>[] = (Array.isArray(raw) ? raw : [raw]).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, 50);
  if (!items.length) return NextResponse.json({ error: 'Bad payload' }, { status: 400 });

  const db = createServiceClient();
  let stored = 0;
  for (const item of items) {
    const id = normalizeProvider(item);
    // Scripts run only on /links, but a vendor account can cover other pages; keep only hub traffic.
    if (id.capturedUrl) {
      try { if (!new URL(id.capturedUrl).pathname.startsWith('/links')) continue; } catch { /* keep: unparseable URL */ }
    }
    const contact = await upsertContact(db, id, provider);
    if (!contact) continue;

    const payload = Object.fromEntries(Object.entries(item).filter(([k]) => !DROP_KEYS.includes(k)));
    await recordMatch(db, { contactId: contact.id, source: provider, evidence: 'provider_match', email: id.email, capturedUrl: id.capturedUrl, payload });

    const token = inviteTokenFromUrl(id.capturedUrl);
    if (token) {
      const { data: inv } = await db.from('hub_invites').select('id').eq('token', token).maybeSingle();
      if (inv) await recordMatch(db, { contactId: contact.id, source: 'invite', evidence: 'invite_used', email: id.email, capturedUrl: id.capturedUrl });
    }
    await syncHubSpot({ email: id.email, name: id.name, company: id.company, title: id.title, source: provider });
    stored++;
  }
  return NextResponse.json({ ok: true, stored });
}
