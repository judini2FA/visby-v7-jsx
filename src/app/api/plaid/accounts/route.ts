import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { decryptSecret } from '@/lib/secret-crypto';

export const dynamic = 'force-dynamic';

// Live balances for the wallet's connected banks. Server fetches from Plaid with the stored
// access_token and returns only display-safe fields (balance, mask, name) to the browser.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: items, error } = await supabase
      .from('plaid_items')
      .select('item_id, access_token, institution_name')
      .eq('wallet', wallet);

    // Table not provisioned yet (PGRST205) or empty → no banks, not an error.
    if (error || !items?.length) return NextResponse.json({ banks: [] });

    const plaid = plaidClient();
    if (!plaid) return NextResponse.json({ banks: [] });

    const banks: any[] = [];
    for (const it of items) {
      try {
        const resp = await plaid.accountsBalanceGet({ access_token: decryptSecret(it.access_token) });
        for (const a of resp.data.accounts) {
          if (a.type !== 'depository') continue; // checking/savings only — skip loans/credit here
          banks.push({
            id: a.account_id,
            item_id: it.item_id,
            institution: it.institution_name ?? a.name ?? 'Bank',
            mask: a.mask ?? '',
            currency: a.balances.iso_currency_code ?? 'USD',
            balance: a.balances.available ?? a.balances.current ?? null,
            subtype: a.subtype ?? null,
          });
        }
      } catch (e: any) {
        console.error('[plaid/accounts] balance fetch failed for', it.item_id, e?.response?.data?.error_code ?? e.message);
      }
    }
    return NextResponse.json({ banks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
