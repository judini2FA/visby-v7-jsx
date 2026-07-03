import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Blueprint 4.1 — lists a wallet's active linked bank accounts.
export async function GET(req: Request) {
  try {
    const wallet = new URL(req.url).searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ accounts: [] });

    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.includes(wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await rateLimit(`bank-list:${wallet}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('linked_bank_accounts')
      .select('id, fc_account_id, institution_name, last4, status, created_at')
      .eq('wallet', wallet)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ accounts: [] });
    return NextResponse.json({ accounts: data ?? [] });
  } catch {
    return NextResponse.json({ accounts: [] });
  }
}
