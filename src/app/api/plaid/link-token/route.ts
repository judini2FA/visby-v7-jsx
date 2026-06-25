import { NextResponse } from 'next/server';
import { Products, CountryCode } from 'plaid';
import { plaidClient } from '@/lib/plaid';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Mint a short-lived link_token to open Plaid Link in the browser. The user logs in on Plaid's
// own UI — Visby never sees their bank credentials.
export async function POST(req: Request) {
  try {
    const { wallet } = await req.json();
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const plaid = plaidClient();
    if (!plaid) return NextResponse.json({ error: 'Bank connections are not configured yet.' }, { status: 503 });

    const resp = await plaid.linkTokenCreate({
      user: { client_user_id: wallet },
      client_name: 'Visby',
      products: [Products.Auth],            // Auth → balance reads now + account/routing for ACH later
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (err: any) {
    return NextResponse.json({ error: err?.response?.data?.error_message ?? err.message }, { status: 500 });
  }
}
