import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateMerchantKeys, hashSecret, lastFour } from '@/lib/merchants';
import { rateLimit, tooManyRequests, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Burner test storefront (/sdk/demo) — lets Judah exercise "Pay with Visby" end-to-end without an
// external site. It must go through the REAL merchant checkout API (POST /api/sdk/checkout with
// Authorization: Bearer sk_visby_...), but merchant secrets are stored HASHED ONLY — there is no way
// for a server route to retrieve one after creation (see src/lib/merchants.ts). So on first call this
// route creates ONE dedicated "Visby Demo Shop" merchant and stashes its plaintext secret in the
// test-only sdk_demo_config table (supabase/migration_sdk_demo.sql) purely so later demo sessions can
// reuse it. This pattern is never appropriate for a real merchant.

function missingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', 'PGRST205'].includes(error.code ?? '')) return true;
  return !!error.message?.includes('does not exist');
}

// Fixed server-side catalog — the client only ever sends product_id. Never trust a client-supplied
// price for a checkout session.
// image flows: demo-session → /api/sdk/checkout (image_url) → sdk_orders → mintProvenanceForSdk →
// items.image_url. A .png is treated as a transparent cutout by isCutout() (rendered contained, no bg);
// a .jpg renders as a photo WITH its background. Sneaker uses a white-bg photo on purpose so the contrast
// with the two cutout .pngs is visible on the minted Tally.
const IMG = 'https://rwdwzigqtfezbyqkfqfx.supabase.co/storage/v1/object/public/item-images';
const DEMO_CATALOG = [
  // Sneaker = RAW photo (.jpg, white bg) → shows the Tally does NOT auto-cut a photo today.
  { product_id: 'demo-sneaker', name: 'Demo Runner Sneaker', price: 0.99, image: `${IMG}/items/1782340185687-uxedsifug2h.jpg` },
  // Headphones + bag = Judah's uploaded photos, RAW (backgrounds intact). The MINT removes the background
  // and attaches the cutout to the NFT — the store shows the original photo, the Tally shows the cutout.
  { product_id: 'demo-headphones', name: 'Demo Wireless Headphones', price: 2.49, image: `${IMG}/demo/headphones-raw.jpg` },
  { product_id: 'demo-bag', name: 'Demo Leather Bag', price: 4.99, image: `${IMG}/demo/bag-raw.jpg` },
] as const;

// Real Solana address for the demo merchant (NFT owner0 at mint). The mint authority address per env,
// with a devnet fallback so a missing env never reintroduces an invalid 'demo-shop' wallet.
const DEMO_MERCHANT_WALLET = process.env.MINT_AUTHORITY_ADDRESS || '2t6xZyjDsXyeDCRWJogLdSgN4YRUNtxEC9Bqf1ZV9YFW';

function randomAlphaNum(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type DemoMerchantResult = { ok: true; secret: string } | { ok: false };

async function getOrCreateDemoMerchant(
  supabase: ReturnType<typeof createServiceClient>
): Promise<DemoMerchantResult> {
  const { data: existing, error: selErr } = await supabase
    .from('sdk_demo_config')
    .select('merchant_id, secret')
    .eq('id', 1)
    .maybeSingle();

  if (selErr) {
    if (missingSchema(selErr)) return { ok: false };
    throw selErr;
  }
  if (existing?.secret) return { ok: true, secret: existing.secret as string };

  // First call ever (or the config row was cleared): mint a fresh demo merchant. This mirrors
  // src/app/api/merchant/route.ts's POST exactly, just with fixed demo identity instead of a caller
  // wallet.
  const keys = generateMerchantKeys();
  const { data: merchant, error: insErr } = await supabase
    .from('merchants')
    .insert({
      owner_wallet: 'demo-shop',
      name: 'Visby Demo Shop',
      slug: 'visby-demo-shop',
      // MUST be a real Solana address — it's the NFT's owner0 at mint. A placeholder ('demo-shop')
      // makes every demo mint fail at createV1. Use the mint authority address (valid, Visby-controlled).
      merchant_wallet: DEMO_MERCHANT_WALLET,
      publishable_key: keys.publishable_key,
      secret_key_hash: hashSecret(keys.secret_key),
      secret_key_last4: lastFour(keys.secret_key),
      webhook_url: null,
      webhook_secret: keys.webhook_secret,
      fee_bps: 350,
    })
    .select('id')
    .single();

  if (insErr) {
    if (missingSchema(insErr)) return { ok: false };
    throw insErr;
  }

  // Best-effort persistence for next time. If this loses a race to a concurrent first call, the other
  // caller's row wins in the DB — but THIS request already holds a valid secret for its own merchant
  // and can complete regardless, so a cfgErr here is not fatal to the current request.
  const { error: cfgErr } = await supabase
    .from('sdk_demo_config')
    .upsert(
      { id: 1, merchant_id: merchant.id, secret: keys.secret_key, created_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
  if (cfgErr && missingSchema(cfgErr)) return { ok: false };

  return { ok: true, secret: keys.secret_key };
}

export async function POST(req: Request) {
  try {
    // No auth on this route (it's a public fake storefront) — hard-cap per IP instead.
    const rl = await rateLimit(`sdk-demo-session:${clientIp(req)}`, { limit: 20, windowSec: 3600 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const body = await req.json().catch(() => ({}));
    // Single "Buy now" → product_id. Cart "Checkout with VisbyPay" → product_ids[] (one order per item).
    const rawIds: string[] = Array.isArray(body?.product_ids)
      ? body.product_ids.filter((x: unknown) => typeof x === 'string')
      : (typeof body?.product_id === 'string' ? [body.product_id] : []);
    if (!rawIds.length || rawIds.length > 20) {
      return NextResponse.json({ error: 'Provide product_id or product_ids[]' }, { status: 400 });
    }
    const products = rawIds.map(id => DEMO_CATALOG.find(p => p.product_id === id));
    if (products.some(p => !p)) {
      return NextResponse.json({ error: 'Unknown product_id' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const merchantResult = await getOrCreateDemoMerchant(supabase);
    if (!merchantResult.ok) {
      return NextResponse.json(
        { error: 'Demo storefront not set up yet — run supabase/migration_sdk_demo.sql' },
        { status: 503 }
      );
    }

    // Absolute origin of THIS app — hits the real merchant API, auth and all, like an external merchant.
    const origin = new URL(req.url).origin;
    const orderIds: string[] = [];
    for (const product of products as typeof DEMO_CATALOG[number][]) {
      const serial_number = 'SDKDEMO-' + randomAlphaNum(6);
      const res = await fetch(`${origin}/api/sdk/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${merchantResult.secret}` },
        body: JSON.stringify({
          product_name: product.name, serial_number, price: product.price, currency: 'USD', image_url: product.image,
          // Link back to the demo storefront from the checkout success screen.
          success_url: `${origin}/sdk/demo`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json?.session_id !== 'string') {
        console.error('[sdk/demo-session] checkout call failed:', res.status, json);
        return NextResponse.json({ error: json?.error || 'Could not create demo checkout session' }, { status: 502 });
      }
      orderIds.push(json.session_id);
    }

    // Single order → its own checkout URL. Multiple → a cart URL bundling the order ids.
    const checkout_url = orderIds.length === 1
      ? `${origin}/sdk/checkout/${orderIds[0]}`
      : `${origin}/sdk/checkout/cart_${orderIds.join('.')}`;

    return NextResponse.json({ checkout_url, order_ids: orderIds, cart: orderIds.length > 1 });
  } catch (err) {
    console.error('[sdk/demo-session] POST error:', err);
    return NextResponse.json({ error: 'Could not create demo checkout session' }, { status: 500 });
  }
}
