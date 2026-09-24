export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!wallet || !(await isAdminRole(wallet, 'super_admin')) || !(await callerOwnsWallet(req, wallet))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const [signups, inquiries] = await Promise.all([
    supabase.from('prelaunch_signups').select('email, ref_code, referred_by, source, interests, created_at').order('created_at', { ascending: true }).limit(10000),
    supabase.from('investor_inquiries').select('id, name, email, firm, message, email_sent, created_at').order('created_at', { ascending: false }).limit(500),
  ]);

  const rows = signups.data ?? [];
  const refCounts = new Map<string, number>();
  for (const r of rows) if (r.referred_by) refCounts.set(r.referred_by, (refCounts.get(r.referred_by) ?? 0) + 1);

  return NextResponse.json({
    signups: rows.map(r => ({ ...r, referrals: refCounts.get(r.ref_code) ?? 0 })),
    inquiries: inquiries.data ?? [],
    migrated: !signups.error,
  });
}
