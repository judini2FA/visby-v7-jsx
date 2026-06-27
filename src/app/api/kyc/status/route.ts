export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { getKycStatus, kycRequired } from '@/lib/kyc';

// The caller's own verification status — drives the "verify to sell" prompt + the verified badge.
export async function GET(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await getKycStatus(ctx.wallets[0]);
  return NextResponse.json({ ...s, required: kycRequired() });
}
