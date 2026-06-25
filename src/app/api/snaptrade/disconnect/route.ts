import { NextResponse } from 'next/server';
import { snaptradeClient } from '@/lib/snaptrade';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Unlink brokerages: delete the SnapTrade user (removes all their connections) and drop our row.
export async function POST(req: Request) {
  try {
    const { wallet } = await req.json();
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: row } = await supabase
      .from('snaptrade_users')
      .select('snaptrade_user_id')
      .eq('wallet', wallet)
      .maybeSingle();

    if (row?.snaptrade_user_id) {
      const snap = snaptradeClient();
      if (snap) await snap.authentication.deleteSnapTradeUser({ userId: row.snaptrade_user_id }).catch(() => {});
    }

    await supabase.from('snaptrade_users').delete().eq('wallet', wallet);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
