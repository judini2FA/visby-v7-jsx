export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/coinbase-commerce';
import { fulfillPurchase } from '@/lib/fulfill';
import { captureError } from '@/lib/monitoring';

// Coinbase Commerce posts charge lifecycle events here. Verify the HMAC-SHA256 signature over the RAW
// body before trusting anything (fail-closed — unconfigured or a bad signature => 401). Only
// charge:confirmed settles a purchase — mirrors the Stripe webhook's payment_intent.succeeded and Moov's
// (dormant) transfer.updated hook: fulfillPurchase is idempotent (no-op if the buyer already owns the
// item), so a redelivered webhook can never double-settle. The price is ECHOED from the charge's own
// metadata (set server-side at create-charge time) — this handler never re-resolves resolveCheckoutPrice,
// so a price that moved between charge-creation and confirmation can't over/undercharge what was paid.
// Every other event type (charge:created, charge:pending, charge:failed, charge:delayed, charge:resolved)
// is informational — 200'd with no action so Coinbase doesn't retry.
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-cc-webhook-signature');
  if (!verifyWebhook(raw, sig)) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const event = payload?.event;
  const type: string = event?.type ?? '';

  try {
    if (type === 'charge:confirmed') {
      const charge = event?.data;
      const metadata = charge?.metadata ?? {};
      const item_id: string | undefined = metadata.item_id;
      const buyer_wallet: string | undefined = metadata.buyer_wallet;
      const price_usdc: string | undefined = metadata.price_usdc;
      if (!item_id || !buyer_wallet) {
        captureError(new Error('coinbase webhook missing metadata'), { stage: 'coinbase webhook', charge_id: charge?.id });
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }
      await fulfillPurchase(item_id, buyer_wallet, price_usdc, null, { pay_method: 'coinbase' });
    }
  } catch (err) {
    captureError(err, { stage: 'coinbase webhook fulfill', event_type: type });
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
