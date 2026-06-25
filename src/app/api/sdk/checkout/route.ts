import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getMerchantBySecretKey } from '@/lib/merchants';
import { feeBreakdown } from '@/lib/fees';
import { checkSerial } from '@/lib/serial-registry';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function missingSchema(error: any): boolean {
  const code = error?.code;
  if (code === '42P01' || code === 'PGRST205') return true;
  return typeof error?.message === 'string' && error.message.includes('does not exist');
}

// success_url/cancel_url are rendered as hrefs on the Visby-hosted checkout — reject anything that isn't
// a real http(s) URL so a malicious merchant can't inject javascript:/data: (XSS) or open-redirect buyers.
function validRedirect(u: unknown): boolean {
  if (typeof u !== 'string' || !u) return false;
  try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization') || '';
    const sk = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!sk || !sk.startsWith('sk_visby_')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const merchant = await getMerchantBySecretKey(sk);
    if (!merchant) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Throttle per merchant (keyed on the authenticated id, not IP, so one merchant can't exhaust others).
    const rl = await rateLimit(`sdk-checkout:${merchant.id}`, { limit: 60, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const body = await req.json().catch(() => ({}));
    const { product_name, serial_number, price, currency, success_url, cancel_url, image_url } = body || {};

    const name = typeof product_name === 'string' ? product_name.trim() : '';
    if (name.length < 1 || name.length > 120) {
      return NextResponse.json({ error: 'product_name must be 1–120 characters' }, { status: 400 });
    }

    // serial_number is required: it's the provenance key for the minted NFT. Reject up front rather than
    // charging the buyer and then being unable to mint.
    const serial = typeof serial_number === 'string' ? serial_number.trim() : '';
    if (serial.length < 1 || serial.length > 120) {
      return NextResponse.json({ error: 'serial_number is required (1–120 chars)' }, { status: 400 });
    }

    // Brand serial-number registry gate — reject a counterfeit-signalling serial NOW, before the buyer
    // is charged and we're committed to minting. Fail-open if the registry is absent.
    const verdict = await checkSerial(serial);
    if (verdict.verdict === 'rejected') {
      return NextResponse.json({ error: verdict.reason, brand: verdict.brand, serial_rejected: true }, { status: 422 });
    }

    const rawPrice = Number(price);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      return NextResponse.json({ error: 'price must be a number greater than 0' }, { status: 400 });
    }
    // Normalize to cent precision so stored price, displayed price, fee basis, and the charged amount agree.
    const priceNum = Math.round(rawPrice * 100) / 100;

    // price column is price_usdc — USD is the only unit today; don't display one currency and charge USD.
    const cur = (typeof currency === 'string' && currency ? currency : 'USD').toUpperCase();
    if (cur !== 'USD') {
      return NextResponse.json({ error: 'Only USD is supported today' }, { status: 400 });
    }

    if (success_url != null && !validRedirect(success_url)) {
      return NextResponse.json({ error: 'success_url must be an absolute http(s) URL' }, { status: 400 });
    }
    if (cancel_url != null && !validRedirect(cancel_url)) {
      return NextResponse.json({ error: 'cancel_url must be an absolute http(s) URL' }, { status: 400 });
    }

    const fee = feeBreakdown(priceNum, 0, 'partner');

    const supabase = createServiceClient();
    const { data: row, error } = await supabase
      .from('sdk_orders')
      .insert({
        merchant_id: merchant.id,
        product_name: name,
        serial_number: serial,
        price_usdc: priceNum,
        currency: cur,
        status: 'pending',
        fee_bps: fee.fee_bps,
        platform_fee_usd: fee.platform_fee_usd,
        merchant_net_usd: fee.seller_net_usd,
        success_url: success_url ?? null,
        cancel_url: cancel_url ?? null,
        image_url: image_url ?? null,
      })
      .select('id')
      .single();

    if (error) {
      if (missingSchema(error)) {
        return NextResponse.json({ error: 'Checkout temporarily unavailable' }, { status: 503 });
      }
      console.error('[sdk/checkout]', error);
      return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 });
    }

    // Absolute URL: the button runs on the merchant's own domain, so a relative path would resolve to
    // the merchant, not Visby. Derive Visby's origin from this request.
    const origin = new URL(req.url).origin;
    return NextResponse.json({
      session_id: row.id,
      checkout_url: `${origin}/sdk/checkout/${row.id}`,
    });
  } catch (err: unknown) {
    console.error('[sdk/checkout]', err);
    return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 });
  }
}
