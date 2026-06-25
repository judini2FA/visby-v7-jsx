import { NextResponse } from 'next/server';
import { snaptradeClient } from '@/lib/snaptrade';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { decryptSecret } from '@/lib/secret-crypto';

export const dynamic = 'force-dynamic';

// Live balances for the wallet's connected brokerages. listUserAccounts already carries each
// account's total balance + institution + masked number, so one call covers the preview tiles.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: row, error } = await supabase
      .from('snaptrade_users')
      .select('snaptrade_user_id, user_secret')
      .eq('wallet', wallet)
      .maybeSingle();

    if (error || !row?.snaptrade_user_id) return NextResponse.json({ brokerages: [] });

    const snap = snaptradeClient();
    if (!snap) return NextResponse.json({ brokerages: [] });

    const resp = await snap.accountInformation.listUserAccounts({ userId: row.snaptrade_user_id, userSecret: decryptSecret(row.user_secret) });
    const brokerages = (resp.data ?? []).map((a: any) => ({
      id: a.id,
      institution: a.institution_name ?? a.name ?? 'Brokerage',
      mask: a.number ? String(a.number).slice(-4) : '',
      currency: a.balance?.total?.currency ?? 'USD',
      balance: a.balance?.total?.amount ?? null,
    }));
    return NextResponse.json({ brokerages });
  } catch (err: any) {
    console.error('[snaptrade/accounts]', err?.responseBody?.detail ?? err.message);
    return NextResponse.json({ brokerages: [] });
  }
}
