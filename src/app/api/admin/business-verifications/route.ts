export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { setBusinessAccount } from '@/lib/business';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

const OVERRIDE_STATUSES = ['approved', 'rejected', 'pending'] as const;
type OverrideStatus = (typeof OVERRIDE_STATUSES)[number];

function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', 'PGRST205'].includes(error.code ?? '')) return true;
  return !!error.message?.includes('does not exist');
}

// Business review sits with the same 'authenticator' role as KYC review (super_admin satisfies it).
async function requireAuthenticator(req: Request, wallet: string | null | undefined): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet, 'authenticator'))) return false;
  return callerOwnsWallet(req, wallet);
}

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!(await requireAuthenticator(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('business_verifications')
    .select('id, wallet, legal_name, ein, business_type, business_address, website, doc_url, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error && isMissingSchema(error)) return NextResponse.json({ verifications: [] });
  return NextResponse.json({ verifications: data ?? [] });
}

// The ONLY writer of profiles.account_type. Business status strictly follows an approved
// business_verifications row: approve → 'business'; reject or send back to pending → 'personal'
// (and self_ship off, so a demoted account can't keep self-shipping). No row, no business account.
export async function POST(req: Request) {
  const { wallet, target_wallet, status } = await req.json().catch(() => ({}));
  if (!(await requireAuthenticator(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!target_wallet || typeof target_wallet !== 'string' || !OVERRIDE_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'A target wallet and valid status are required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from('business_verifications')
    .update({ status: status as OverrideStatus, updated_at: new Date().toISOString() })
    .eq('wallet', target_wallet)
    .select('id')
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ error: 'Business verification is not available yet' }, { status: 503 });
    console.error('[admin/business-verifications] update error:', error);
    return NextResponse.json({ error: 'Could not update' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'No verification submitted for that wallet' }, { status: 404 });

  const set = await setBusinessAccount(target_wallet, status === 'approved');
  if (!set.ok) {
    return NextResponse.json({ error: 'Verification updated but the profile flag failed — retry' }, { status: 500 });
  }

  void logSecurityEvent({ wallet, event: 'business_verification_override', detail: { target_wallet, status }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
  return NextResponse.json({ ok: true });
}
