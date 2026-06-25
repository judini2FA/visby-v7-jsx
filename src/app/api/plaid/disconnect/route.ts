import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { decryptSecret } from '@/lib/secret-crypto';

export const dynamic = 'force-dynamic';

// Unlink a bank: revoke the item at Plaid (best-effort) and drop our stored access_token.
export async function POST(req: Request) {
  try {
    const { wallet, item_id } = await req.json();
    if (!wallet || !item_id) return NextResponse.json({ error: 'Missing wallet or item_id' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: item } = await supabase
      .from('plaid_items')
      .select('access_token')
      .eq('wallet', wallet)
      .eq('item_id', item_id)
      .maybeSingle();

    if (item?.access_token) {
      const plaid = plaidClient();
      if (plaid) await plaid.itemRemove({ access_token: decryptSecret(item.access_token) }).catch(() => {});
    }

    await supabase.from('plaid_items').delete().eq('wallet', wallet).eq('item_id', item_id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
