export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { getKycStatusForUser, kycRequired } from '@/lib/kyc';

// The caller's own verification status — drives the "verify to sell" prompt + the verified badge. Per-user:
// verifying on any linked wallet shows as verified on all of them (mirrors the sell gate).
export async function GET(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await getKycStatusForUser(ctx.wallets);
  return NextResponse.json({ ...s, required: kycRequired() });
}
