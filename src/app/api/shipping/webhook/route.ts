export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { finalizeDelivery } from '@/lib/order-finalize';
import { rateLimit, tooManyRequests, clientIp } from '@/lib/rate-limit';

// AtoShip posts tracking-event webhooks here. On a DELIVERED scan we auto-finalize the order the same
// way a buyer's manual "confirm delivery" does — see src/lib/order-finalize.ts for the shared logic and
// the buyer-vs-carrier dispute/payout divergence. This route only has to: verify the request is really
// from AtoShip, find which order the tracking number belongs to, and detect a delivered status.

// --- Authenticity -----------------------------------------------------------------------------------
//
// AtoShip's exact webhook signature scheme (header name + algorithm) should be confirmed against their
// docs/dashboard and this adjusted to match once known. Until then we support a generic HMAC-SHA256-of-
// raw-body scheme via SHIPPING_WEBHOOK_SECRET, with the signature header name configurable via
// SHIPPING_WEBHOOK_SIG_HEADER (defaults to 'x-atoship-signature' — a reasonable guess at AtoShip's
// convention). The RELIABLE fallback — and the one to actually configure in the AtoShip dashboard if it
// only supports a plain shared secret rather than HMAC — is a shared-secret check: either
// `Authorization: Bearer <SHIPPING_WEBHOOK_SECRET>` or `?secret=<SHIPPING_WEBHOOK_SECRET>` in the
// webhook URL. Either path passing is sufficient; if SHIPPING_WEBHOOK_SECRET is unset we fail CLOSED
// (401 on everything) so a misconfigured deployment can never auto-finalize orders from an unverified
// caller — this endpoint releases money, so "no secret configured" must never mean "trust anything".
const SIG_HEADER = process.env.SHIPPING_WEBHOOK_SIG_HEADER || 'x-atoship-signature';

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function verifyHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  // Some providers prefix the digest, e.g. "sha256=<hex>" — accept either form.
  const sig = signature.trim().replace(/^sha256=/i, '');
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedB64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return timingSafeEqualStr(sig, expectedHex) || timingSafeEqualStr(sig, expectedB64);
}

function verifySharedSecret(req: Request, secret: string): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer && timingSafeEqualStr(bearer, secret)) return true;

  const url = new URL(req.url);
  const qs = url.searchParams.get('secret') ?? '';
  if (qs && timingSafeEqualStr(qs, secret)) return true;

  return false;
}

function verifyRequest(req: Request, rawBody: string): boolean {
  const secret = process.env.SHIPPING_WEBHOOK_SECRET;
  if (!secret) return false; // fail closed — see comment above

  if (verifySharedSecret(req, secret)) return true;

  const sigHeader = req.headers.get(SIG_HEADER);
  if (verifyHmac(rawBody, sigHeader, secret)) return true;

  return false;
}

// --- Event parsing -----------------------------------------------------------------------------------
//
// AtoShip's exact webhook payload shape isn't confirmed (see src/lib/shipping/atoship.ts header note
// re: response-shape assumptions generally) — try the common field-name variants carriers/aggregators
// use so this survives whichever shape AtoShip actually sends, and revisit once seen live.
function pick(obj: any, paths: string[]): string | null {
  for (const path of paths) {
    const parts = path.split('.');
    let v: any = obj;
    for (const p of parts) v = v?.[p];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function extractTrackingNumber(event: any): string | null {
  return pick(event, ['tracking_number', 'data.tracking_number', 'tracking.tracking_number']);
}

function extractStatus(event: any): string | null {
  return pick(event, ['status', 'data.status', 'tracking.status']);
}

function extractStatusDetail(event: any): string | null {
  return pick(event, ['status_detail', 'data.status_detail', 'tracking.status_detail']);
}

function isDeliveredEvent(event: any): boolean {
  const status = (extractStatus(event) ?? '').toLowerCase();
  if (status === 'delivered') return true;
  const detail = (extractStatusDetail(event) ?? '').toLowerCase();
  return detail.includes('delivered');
}

export async function POST(req: Request) {
  // Light per-IP throttle — this is a public, unauthenticated-until-verified endpoint. Auth failures and
  // legitimate carrier traffic both count against it; generous enough for normal webhook volume.
  const rl = await rateLimit(`shipping-webhook:${clientIp(req)}`, { limit: 60, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const rawBody = await req.text();

  if (!verifyRequest(req, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: any;
  try {
    event = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: 'Unparseable body' }, { status: 400 });
  }

  try {
    if (!isDeliveredEvent(event)) {
      // Always 200 on a recognized-but-irrelevant event so the carrier's retry logic doesn't hammer us.
      return NextResponse.json({ ok: true, ignored: true });
    }

    const trackingNumber = extractTrackingNumber(event);
    if (!trackingNumber) {
      // A delivered event with no tracking number we can act on — nothing to key off of. Acknowledge
      // so it isn't retried forever; log for visibility since this shouldn't normally happen.
      console.error('[shipping/webhook] delivered event missing a tracking number:', event);
      return NextResponse.json({ ok: true, ignored: true });
    }

    const supabase = createServiceClient();

    // Most recent still-open (paid/shipped) order with this tracking number. Scoping to paid/shipped
    // means an already-delivered (or cancelled/refunded) order is naturally skipped here — combined with
    // the CAS inside finalizeDelivery, a duplicate/retried carrier webhook is always idempotent.
    const { data: order, error: lookupErr } = await supabase
      .from('orders')
      .select('id')
      .eq('tracking_number', trackingNumber)
      .in('status', ['paid', 'shipped'])
      .order('shipped_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (lookupErr) {
      console.error('[shipping/webhook] order lookup error:', lookupErr);
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!order) {
      // No matching open order — either the tracking number isn't ours, or it was already finalized
      // (e.g. buyer confirmed first, or a previous webhook delivery already handled it). Idempotent 200.
      return NextResponse.json({ ok: true, already: true });
    }

    const result = await finalizeDelivery(order.id, { source: 'carrier' });

    if (!result.ok) {
      // finalizeDelivery failed internally (not a claim race — an actual error). Log for investigation;
      // still 200 so AtoShip doesn't retry-storm us over what needs human/log follow-up, not a resend.
      console.error('[shipping/webhook] finalizeDelivery error:', result.error, { orderId: order.id });
      return NextResponse.json({ ok: true, error: result.error });
    }
    if (!result.claimed) {
      // Lost the CAS race (e.g. buyer confirmed in the same window) — already finalized, nothing to do.
      return NextResponse.json({ ok: true, already: true });
    }

    return NextResponse.json({
      ok: true,
      order_id: order.id,
      payout_released: result.payout_released,
      ...(result.payout_skipped_reason ? { payout_skipped_reason: result.payout_skipped_reason } : {}),
    });
  } catch (err) {
    console.error('[shipping/webhook] error:', err);
    // Still 200: an unexpected exception here shouldn't cause the carrier to retry-storm; the underlying
    // order is untouched (finalizeDelivery's own CAS means nothing partially applies) and can be
    // reconciled from logs / re-triggered by the next tracking event or the buyer's manual confirm.
    return NextResponse.json({ ok: true, error: 'Internal error' });
  }
}
