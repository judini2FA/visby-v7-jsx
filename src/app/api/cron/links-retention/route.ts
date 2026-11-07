export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';

// Data retention for the /links hub. Events, sessions and raw provider payloads older than
// LINKS_RETENTION_DAYS (default 395) are deleted; contacts stay until deleted from /admin/links.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers.get('x-cron-secret') ?? '');
  if (!provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const days = Math.max(30, Number(process.env.LINKS_RETENTION_DAYS ?? 395) || 395);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const db = createServiceClient();
  const results = await Promise.all([
    db.from('hub_events').delete().lt('created_at', cutoff),
    db.from('hub_identity_matches').update({ payload: null }).lt('created_at', cutoff),
    db.from('hub_consents').delete().lt('created_at', cutoff),
  ]);
  await db.from('hub_sessions').delete().lt('last_seen', cutoff);
  await db.from('hub_visitors').delete().lt('last_seen', cutoff).is('contact_id', null);
  const failed = results.find(r => r.error);
  return NextResponse.json({ ok: !failed, cutoff });
}

export const GET = handle;
export const POST = handle;
