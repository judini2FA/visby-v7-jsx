export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { VID_COOKIE, isUuid } from '@/lib/links-hub';

export async function POST(req: Request) {
  const rl = await rateLimit(`links-consent:${clientIp(req)}`, { limit: 20, windowSec: 60 });
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const body = await req.json().catch(() => ({})) as { choice?: unknown };
  const choice = body.choice === 'accepted' || body.choice === 'declined' || body.choice === 'gpc' ? body.choice : null;
  if (!choice) return NextResponse.json({ ok: false }, { status: 400 });

  const vid = cookies().get(VID_COOKIE)?.value;
  if (!isUuid(vid)) return NextResponse.json({ ok: true });

  try {
    const db = createServiceClient();
    const { data: v } = await db.from('hub_visitors').select('id').eq('id', vid).maybeSingle();
    if (v) {
      await db.from('hub_consents').insert({ visitor_id: vid, choice });
      await db.from('hub_visitors').update({ vendor_optout: choice !== 'accepted' }).eq('id', vid);
    }
  } catch (e) {
    console.error('[links] consent failed', (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
