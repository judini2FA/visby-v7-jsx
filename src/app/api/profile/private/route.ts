export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';

// Authed read of a profile's PRIVATE fields (cross-chain wallet graph + Tally Destination). getProfile
// is public and must NOT expose these, so the owner reads them here after proving (via Privy token) that
// they control the wallet. Returns empty defaults tolerantly when the columns aren't migrated yet.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet') ?? '';
  if (!wallet) return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  if (!(await callerOwnsWallet(req, wallet))) {
    return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('profiles')
    .select('connected_wallets, tally_wallet')
    .eq('wallet', wallet)
    .single();

  return NextResponse.json({
    connected_wallets: Array.isArray((data as any)?.connected_wallets) ? (data as any).connected_wallets : [],
    tally_wallet: typeof (data as any)?.tally_wallet === 'string' ? (data as any).tally_wallet : '',
  });
}
