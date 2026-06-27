export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { setKycStatus, type KycStatus } from '@/lib/kyc';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

const OVERRIDE_STATUSES: KycStatus[] = ['approved', 'declined', 'review', 'unverified', 'pending'];

// KYC review belongs to the 'authenticator' role (super_admin satisfies it). The caller must also prove
// wallet ownership, same as the rest of the admin surface.
async function requireAuthenticator(req: Request, wallet: string | null | undefined): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet, 'authenticator'))) return false;
  return callerOwnsWallet(req, wallet);
}

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!(await requireAuthenticator(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('kyc_verifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  return NextResponse.json({ verifications: data ?? [] });
}

export async function POST(req: Request) {
  const { wallet, target_wallet, status } = await req.json().catch(() => ({}));
  if (!(await requireAuthenticator(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!target_wallet || typeof target_wallet !== 'string' || !OVERRIDE_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'A target wallet and valid status are required' }, { status: 400 });
  }

  await setKycStatus(target_wallet, status as KycStatus);
  const supabase = createServiceClient();
  const rowStatus = status === 'approved' ? 'approved' : status === 'declined' ? 'declined' : 'needs_review';
  await supabase.from('kyc_verifications')
    .update({ status: rowStatus, reason: 'admin override', updated_at: new Date().toISOString() })
    .eq('wallet', target_wallet);

  void logSecurityEvent({ wallet, event: 'kyc_override', detail: { target_wallet, status }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
  return NextResponse.json({ ok: true });
}
