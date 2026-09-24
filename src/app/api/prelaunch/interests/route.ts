export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { cleanInterests, isRefCode } from '@/lib/prelaunch';

// Keyed by the unguessable ref code the signup response returned, so only that visitor can set it.
export async function POST(req: Request) {
  const rl = await rateLimit(`prelaunch-interests:${clientIp(req)}`, { limit: 20, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const body = await req.json().catch(() => ({}));
  if (!isRefCode(body.code)) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });

  const interests = cleanInterests(body.interests);
  const { error } = await createServiceClient().from('prelaunch_signups').update({ interests }).eq('ref_code', body.code);
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  return NextResponse.json({ ok: true, interests });
}
