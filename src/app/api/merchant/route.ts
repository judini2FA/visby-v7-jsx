import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { generateMerchantKeys, hashSecret, lastFour } from '@/lib/merchants';

export const dynamic = 'force-dynamic';

// A supabase error means "missing schema" (merchants migration pending) when the table doesn't
// exist yet. Reads degrade to a safe default; writes surface as 503 (can't proceed without the table).
function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', 'PGRST205'].includes(error.code ?? '')) return true;
  return !!error.message?.includes('does not exist');
}

// Columns safe to expose to a merchant owner. NEVER select secret_key_hash or webhook_secret.
const PUBLIC_COLUMNS =
  'id,name,slug,merchant_wallet,publishable_key,secret_key_last4,webhook_url,fee_bps,active,created_at';

// merchant_wallet becomes the payout/provenance destination, so reject anything that isn't a plausible
// Solana base58 address before it's stored.
function isValidSolAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}

// We POST signed webhooks to this URL server-side, so block private/loopback hosts (SSRF) and non-http(s).
function isValidWebhookUrl(u: string): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const owner_wallet = body?.owner_wallet as string | undefined;
    const name = (body?.name as string | undefined)?.trim();
    const merchant_wallet = body?.merchant_wallet as string | undefined;
    const webhook_url = body?.webhook_url as string | undefined;

    if (!owner_wallet) return NextResponse.json({ error: 'Missing owner_wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, owner_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!name || name.length < 1 || name.length > 80) {
      return NextResponse.json({ error: 'Name must be 1–80 characters' }, { status: 400 });
    }
    if (merchant_wallet && !isValidSolAddress(merchant_wallet)) {
      return NextResponse.json({ error: 'merchant_wallet must be a valid Solana address' }, { status: 400 });
    }
    if (webhook_url && !isValidWebhookUrl(webhook_url)) {
      return NextResponse.json({ error: 'webhook_url must be a public http(s) URL' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // One merchant account per owner wallet (the current model). Special-cased here for a clean 409
    // instead of leaning on the publishable_key unique index (which is random and wouldn't collide).
    const { data: existing } = await supabase
      .from('merchants').select('id').eq('owner_wallet', owner_wallet).eq('active', true).limit(1);
    if (existing && existing.length) {
      return NextResponse.json({ error: 'A merchant account already exists for this wallet.' }, { status: 409 });
    }

    const keys = generateMerchantKeys();

    const { data, error } = await supabase
      .from('merchants')
      .insert({
        owner_wallet,
        name,
        merchant_wallet: merchant_wallet || owner_wallet,
        publishable_key: keys.publishable_key,
        secret_key_hash: hashSecret(keys.secret_key),
        secret_key_last4: lastFour(keys.secret_key),
        webhook_url: webhook_url ?? null,
        webhook_secret: keys.webhook_secret,
        fee_bps: 350,
      })
      .select('id,name,publishable_key,secret_key_last4,webhook_url,fee_bps')
      .single();

    if (error) {
      if (isMissingSchema(error)) {
        return NextResponse.json({ error: 'Merchant accounts not available yet' }, { status: 503 });
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A merchant account already exists.' }, { status: 409 });
      }
      console.error('[merchant] create error:', error);
      return NextResponse.json({ error: 'Could not create merchant' }, { status: 500 });
    }

    // Plaintext secret_key + webhook_secret are returned ONCE, here only — never stored in plaintext,
    // never returned by GET.
    return NextResponse.json({
      ok: true,
      merchant: {
        id: data.id,
        name: data.name,
        publishable_key: data.publishable_key,
        secret_key_last4: data.secret_key_last4,
        webhook_url: data.webhook_url,
        fee_bps: data.fee_bps,
      },
      secret_key: keys.secret_key,
      webhook_secret: keys.webhook_secret,
    });
  } catch (err) {
    console.error('[merchant] POST error:', err);
    return NextResponse.json({ error: 'Could not create merchant' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const owner_wallet = searchParams.get('owner_wallet');
    if (!owner_wallet) return NextResponse.json({ error: 'Missing owner_wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, owner_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('merchants')
      .select(PUBLIC_COLUMNS)
      .eq('owner_wallet', owner_wallet)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingSchema(error)) return NextResponse.json({ merchants: [] });
      console.error('[merchant] list error:', error);
      return NextResponse.json({ merchants: [] });
    }

    return NextResponse.json({ merchants: data ?? [] });
  } catch (err) {
    console.error('[merchant] GET error:', err);
    return NextResponse.json({ error: 'Could not load merchants' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const owner_wallet = body?.owner_wallet as string | undefined;
    const merchant_id = body?.merchant_id as string | undefined;

    if (!owner_wallet) return NextResponse.json({ error: 'Missing owner_wallet' }, { status: 400 });
    if (!merchant_id) return NextResponse.json({ error: 'Missing merchant_id' }, { status: 400 });
    if (!(await callerOwnsWallet(req, owner_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body?.name === 'string') {
      const name = body.name.trim();
      if (name.length < 1 || name.length > 80) {
        return NextResponse.json({ error: 'Name must be 1–80 characters' }, { status: 400 });
      }
      patch.name = name;
    }
    if (typeof body?.merchant_wallet === 'string') {
      if (!isValidSolAddress(body.merchant_wallet)) {
        return NextResponse.json({ error: 'merchant_wallet must be a valid Solana address' }, { status: 400 });
      }
      patch.merchant_wallet = body.merchant_wallet.trim();
    }
    if (typeof body?.webhook_url === 'string' || body?.webhook_url === null) {
      if (typeof body.webhook_url === 'string' && body.webhook_url && !isValidWebhookUrl(body.webhook_url)) {
        return NextResponse.json({ error: 'webhook_url must be a public http(s) URL' }, { status: 400 });
      }
      patch.webhook_url = body.webhook_url || null;
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('merchants')
      .update(patch)
      .eq('owner_wallet', owner_wallet)
      .eq('id', merchant_id);

    if (error) {
      if (isMissingSchema(error)) {
        return NextResponse.json({ error: 'Merchant accounts not available yet' }, { status: 503 });
      }
      console.error('[merchant] update error:', error);
      return NextResponse.json({ error: 'Could not update merchant' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[merchant] PATCH error:', err);
    return NextResponse.json({ error: 'Could not update merchant' }, { status: 500 });
  }
}
