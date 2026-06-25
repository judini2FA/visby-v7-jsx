import { NextResponse } from 'next/server';
import { snaptradeClient } from '@/lib/snaptrade';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { encryptSecret, decryptSecret } from '@/lib/secret-crypto';

export const dynamic = 'force-dynamic';

// Register the wallet as a SnapTrade user (once) and return the connection-portal URL.
// The user links their brokerage on SnapTrade's hosted portal — Visby never sees their broker login.
export async function POST(req: Request) {
  try {
    const { wallet } = await req.json();
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const snap = snaptradeClient();
    if (!snap) return NextResponse.json({ error: 'Brokerage connections are not configured yet.' }, { status: 503 });

    const supabase = createServiceClient();
    const { data: existing } = await supabase
      .from('snaptrade_users')
      .select('snaptrade_user_id, user_secret')
      .eq('wallet', wallet)
      .maybeSingle();

    let userId = existing?.snaptrade_user_id;
    let userSecret = existing?.user_secret ? decryptSecret(existing.user_secret) : undefined;

    if (!userId || !userSecret) {
      const reg = await snap.authentication.registerSnapTradeUser({ userId: wallet });
      userId = reg.data.userId!;
      userSecret = reg.data.userSecret!;
      const { error } = await supabase.from('snaptrade_users').upsert(
        { wallet, snaptrade_user_id: userId, user_secret: encryptSecret(userSecret) },
        { onConflict: 'wallet' },
      );
      if (error) {
        console.error('[snaptrade/connect] persist failed:', error.message);
        return NextResponse.json({ error: 'Could not save brokerage connection.' }, { status: 500 });
      }
    }

    const login = await snap.authentication.loginSnapTradeUser({ userId, userSecret });
    const redirectURI = (login.data as any)?.redirectURI;
    if (!redirectURI) return NextResponse.json({ error: 'Could not start brokerage connection.' }, { status: 500 });
    return NextResponse.json({ redirectURI });
  } catch (err: any) {
    return NextResponse.json({ error: err?.responseBody?.detail ?? err.message }, { status: 500 });
  }
}
