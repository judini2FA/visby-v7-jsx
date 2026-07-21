import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { captureError, captureMessage } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Early-warning sweep for Stripe webhook health. Stripe auto-disables a webhook endpoint after ~days of
// failed deliveries; the failures (timeouts / "no response") never reach our own code, so the ONLY way to
// notice before Stripe pulls the plug is to poll the endpoint status. This cron lists our webhook
// endpoints and fires a high-signal alert if any is disabled — turning a silent multi-day outage into a
// same-day alert. Read-only against Stripe; guarded by CRON_SECRET; fails closed when unconfigured.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers.get('x-cron-secret') ?? '');
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ ok: true, skipped: 'STRIPE_SECRET_KEY unset' });

  try {
    const stripe = new Stripe(key);
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const disabled = endpoints.data.filter(e => e.status !== 'enabled');

    if (disabled.length) {
      captureMessage('error', 'ALERT stripe_webhook_endpoint_disabled', {
        alert: 'stripe_webhook_endpoint_disabled',
        count: disabled.length,
        endpoints: disabled.map(e => ({ id: e.id, url: e.url, status: e.status })),
      });
    }

    return NextResponse.json({
      ok: true,
      checked: endpoints.data.length,
      disabled: disabled.length,
      disabled_endpoints: disabled.map(e => ({ id: e.id, url: e.url, status: e.status })),
    });
  } catch (err) {
    captureError(err, { stage: 'cron stripe-webhook-health' });
    return NextResponse.json({ error: 'Webhook health check failed' }, { status: 500 });
  }
}

// GET so Vercel Cron (which issues GET) can drive it; POST for manual invocation.
export const GET = handle;
export const POST = handle;
