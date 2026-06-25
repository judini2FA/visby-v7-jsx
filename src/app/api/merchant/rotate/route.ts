import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { generateMerchantKeys, hashSecret, lastFour } from '@/lib/merchants';

export const dynamic = 'force-dynamic';

function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', 'PGRST205'].includes(error.code ?? '')) return true;
  return !!error.message?.includes('does not exist');
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const owner_wallet = body?.owner_wallet as string | undefined;
    const merchant_id = body?.merchant_id as string | undefined;
    const which = body?.which as string | undefined;

    if (!owner_wallet) return NextResponse.json({ error: 'Missing owner_wallet' }, { status: 400 });
    if (!merchant_id) return NextResponse.json({ error: 'Missing merchant_id' }, { status: 400 });
    if (which !== 'secret' && which !== 'webhook') {
      return NextResponse.json({ error: "which must be 'secret' or 'webhook'" }, { status: 400 });
    }
    if (!(await callerOwnsWallet(req, owner_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = generateMerchantKeys();
    const supabase = createServiceClient();

    if (which === 'secret') {
      const { error } = await supabase
        .from('merchants')
        .update({
          secret_key_hash: hashSecret(keys.secret_key),
          secret_key_last4: lastFour(keys.secret_key),
          updated_at: new Date().toISOString(),
        })
        .eq('owner_wallet', owner_wallet)
        .eq('id', merchant_id);

      if (error) {
        if (isMissingSchema(error)) {
          return NextResponse.json({ error: 'Merchant accounts not available yet' }, { status: 503 });
        }
        console.error('[merchant/rotate] secret error:', error);
        return NextResponse.json({ error: 'Could not rotate secret key' }, { status: 500 });
      }
      // Returned ONCE — the plaintext secret is never persisted, only its hash.
      return NextResponse.json({ ok: true, secret_key: keys.secret_key });
    }

    const { error } = await supabase
      .from('merchants')
      .update({
        webhook_secret: keys.webhook_secret,
        updated_at: new Date().toISOString(),
      })
      .eq('owner_wallet', owner_wallet)
      .eq('id', merchant_id);

    if (error) {
      if (isMissingSchema(error)) {
        return NextResponse.json({ error: 'Merchant accounts not available yet' }, { status: 503 });
      }
      console.error('[merchant/rotate] webhook error:', error);
      return NextResponse.json({ error: 'Could not rotate webhook secret' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, webhook_secret: keys.webhook_secret });
  } catch (err) {
    console.error('[merchant/rotate] POST error:', err);
    return NextResponse.json({ error: 'Could not rotate key' }, { status: 500 });
  }
}
