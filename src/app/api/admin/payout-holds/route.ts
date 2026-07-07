export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';

// Admin review queue for OFAC-held payouts (blueprint 6.4). Lists payouts that were held because the
// seller's wallet matched the OFAC list or screening was unavailable. Read-only; gated to finance/moderator
// admins (same pattern as the chargeback bundle). `wallet` = the admin's own wallet, proven via the token.
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet is required' }, { status: 400 });

  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdminRole(wallet, 'finance')) && !(await isAdminRole(wallet, 'moderator'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('payout_holds')
    .select('id, order_id, seller_wallet, reason, matched_address, status, created_at, resolved_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ holds: data ?? [] });
}
