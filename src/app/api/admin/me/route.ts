export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin';

// The caller's admin role (or null) — lets the UI show an Admin entry only to admins. Checks every
// linked wallet so an env-bootstrap or DB-granted role on any of them counts.
export async function GET(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ role: null });
  for (const w of ctx.wallets) {
    const role = await getAdminRole(w);
    if (role) return NextResponse.json({ role, wallet: w });
  }
  return NextResponse.json({ role: null });
}
