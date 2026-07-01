export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { verifyMoovWebhook } from '@/lib/moov';
import { captureError } from '@/lib/monitoring';

// Moov posts transfer / account / capability events here. We verify the HMAC-SHA512 signature over the
// headers before trusting anything. The settlement hook is intentionally dormant until Moov becomes the
// active card rail — the current money path still runs through Stripe.
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = verifyMoovWebhook({
    timestamp: req.headers.get('x-timestamp'),
    nonce: req.headers.get('x-nonce'),
    webhookId: req.headers.get('x-webhook-id'),
    signature: req.headers.get('x-signature'),
  });
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  try {
    const type: string = event?.type ?? event?.eventType ?? '';
    // Wire-up point: once Moov is the live rail, map transfer.updated → completed/failed to order
    // settlement here (the same durable pattern the Stripe webhook uses). Dormant for now.
    if (type.startsWith('transfer.')) { /* settlement hook pending Moov checkout */ }
  } catch (err) {
    captureError(err, { stage: 'moov webhook', event_type: event?.type });
  }
  return NextResponse.json({ ok: true });
}
