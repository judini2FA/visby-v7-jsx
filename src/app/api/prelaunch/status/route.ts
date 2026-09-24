export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { isRefCode, standing, waitlistTotal } from '@/lib/prelaunch';
import { COUNTER_MIN } from '@/lib/prelaunch-shared';

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code');
  const [total, s] = await Promise.all([waitlistTotal(), isRefCode(code) ? standing(code) : Promise.resolve(null)]);
  return NextResponse.json({
    waiting: total >= COUNTER_MIN ? total : null,
    standing: s,
  });
}
