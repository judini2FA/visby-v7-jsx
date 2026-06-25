import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { encryptSecret } from '@/lib/secret-crypto';

export const dynamic = 'force-dynamic';

// Swap the one-time public_token from Plaid Link for a long-lived access_token, and persist it
// server-side (RLS-on table, service-role write). The browser never receives the access_token.
export async function POST(req: Request) {
  try {
    const { wallet, public_token, institution_name } = await req.json();
    if (!wallet || !public_token) return NextResponse.json({ error: 'Missing wallet or public_token' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const plaid = plaidClient();
    if (!plaid) return NextResponse.json({ error: 'Bank connections are not configured yet.' }, { status: 503 });

    const ex = await plaid.itemPublicTokenExchange({ public_token });
    const access_token = ex.data.access_token;
    const item_id = ex.data.item_id;

    const supabase = createServiceClient();
    const { error } = await supabase.from('plaid_items').upsert(
      { wallet, item_id, access_token: encryptSecret(access_token), institution_name: institution_name ?? null },
      { onConflict: 'item_id' },
    );
    if (error) {
      console.error('[plaid/exchange] persist failed:', error.message);
      return NextResponse.json({ error: 'Could not save bank connection.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.response?.data?.error_message ?? err.message }, { status: 500 });
  }
}
