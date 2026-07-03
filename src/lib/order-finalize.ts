import { createServiceClient } from '@/lib/supabase/service';
import { releasePayout } from '@/lib/payout';
import { feeBreakdown } from '@/lib/fees';
import { notify } from '@/lib/notifications';
import { emailWallet } from '@/lib/email';
import { orderDeliveredSeller, reviewRequestBuyer } from '@/lib/email-templates';
import { signReviewToken } from '@/lib/review-token';

// Shared delivery-finalization path for BOTH triggers that can mark an order delivered:
//   • source:'buyer'   — the buyer taps "confirm delivery" (src/app/api/orders/confirm/route.ts)
//   • source:'carrier' — AtoShip's webhook reports the tracking number as delivered
//     (src/app/api/shipping/webhook/route.ts)
//
// Money-critical: this is the ONLY place that releases a seller's escrowed payout on delivery.
// Both callers funnel through the same CAS + payout logic so there is exactly one code path to audit.
//
// Exactly-once: the CAS update (.in('status', ['paid','shipped']) -> 'delivered') is the single choke
// point. Whichever caller wins the CAS — a buyer tapping confirm, or a carrier webhook (possibly
// retried by the carrier, or racing the buyer) — is the only one that proceeds to dispute handling
// and payout. A duplicate carrier webhook, or a buyer confirm that loses the race to the webhook (or
// vice versa), always finds the order already out of ['paid','shipped'] and is told so via `claimed:false`.
export type FinalizeSource = 'buyer' | 'carrier';

export type FinalizeOpts = {
  source: FinalizeSource;
  // Required when source:'buyer' — scopes the CAS to the caller's own order, matching the pre-refactor
  // behavior of orders/confirm (buyer_wallet was part of the .eq() chain). Ignored for source:'carrier'
  // (the carrier has no wallet to assert; the webhook route independently verifies the request's
  // authenticity via HMAC/shared-secret, and the tracking-number lookup already scopes to one order).
  buyerWallet?: string;
};

export type FinalizeResult =
  | { ok: true; claimed: false; reason: 'not_found_or_already_finalized' }
  | {
      ok: true;
      claimed: true;
      order: Record<string, unknown>;
      net: number;
      payout_released: boolean;
      payout_tx: string | null;
      payout_error?: string;
      payout_skipped_reason?: 'open_dispute';
    }
  | { ok: false; error: string };

function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === '42703' ||
    !!error.message?.includes('does not exist')
  );
}

export async function finalizeDelivery(orderId: string, opts: FinalizeOpts): Promise<FinalizeResult> {
  try {
    if (!orderId) return { ok: false, error: 'Missing order_id' };
    if (opts.source === 'buyer' && !opts.buyerWallet) return { ok: false, error: 'Missing buyer_wallet' };

    const supabase = createServiceClient();

    // Atomically claim the delivery. Whoever flips paid/shipped -> delivered owns dispute handling +
    // payout for this order — see module header. For source:'buyer' the CAS also matches buyer_wallet,
    // exactly as the original inline implementation did, so a buyer can only confirm their own order.
    // TODO(4.7): assertTransition('paid'|'shipped', 'delivered') here — see src/lib/order-state-machine.ts.
    let claimQuery = supabase
      .from('orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', orderId)
      .in('status', ['paid', 'shipped']);
    if (opts.source === 'buyer') {
      claimQuery = claimQuery.eq('buyer_wallet', opts.buyerWallet as string);
    }
    const { data: order, error } = await claimQuery.select().single();

    if (error || !order) return { ok: true, claimed: false, reason: 'not_found_or_already_finalized' };

    // --- Dispute handling: diverges by source. ---
    //
    // source:'buyer' — confirming receipt IS the buyer accepting the item, so they can't simultaneously
    // claim it never arrived or wasn't as described: auto-close any dispute they filed on this order.
    // This is an affirmative buyer action, so closing it is safe and matches pre-refactor behavior.
    //
    // source:'carrier' — a carrier scan is NOT the buyer accepting anything; it only proves the package
    // reached the address. If the buyer already has an open/under_review dispute on this order, a carrier
    // "delivered" event must NOT close it or release the payout out from under an active dispute — that
    // would let a seller (or a lost/stolen-after-delivery scenario) route around buyer protection just
    // because the carrier scanned the barcode. So for source:'carrier' we only check for an open dispute
    // (never close one) and use its presence to gate payout below.
    let hasOpenDispute = false;
    if (opts.source === 'buyer') {
      try {
        await supabase
          .from('disputes')
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .eq('order_id', order.id)
          .in('status', ['open', 'under_review']);
      } catch (disputeErr) {
        console.error('[order-finalize] could not auto-close dispute:', disputeErr);
      }
    } else {
      try {
        const { data: openDisputes, error: dErr } = await supabase
          .from('disputes')
          .select('id')
          .eq('order_id', order.id)
          .in('status', ['open', 'under_review'])
          .limit(1);
        if (dErr && !isMissingSchema(dErr)) {
          console.error('[order-finalize] dispute lookup error (treating as no dispute):', dErr);
        }
        hasOpenDispute = !!openDisputes && openDisputes.length > 0;
      } catch (dErr) {
        console.error('[order-finalize] dispute lookup threw (treating as no dispute):', dErr);
      }
    }

    // Net the seller receives: price - platform fee - shipping (never negative). Never let a missing
    // fee (pre-migration NULL) collapse to $0 — re-derive it from price + channel so Visby's cut holds.
    const price    = Number(order.price_usdc ?? 0);
    const fee      = order.platform_fee_usd != null
      ? Number(order.platform_fee_usd)
      : feeBreakdown(price, 0, order.sale_channel ?? undefined).platform_fee_usd;
    const shipping = Number(order.shipping_cost ?? 0);
    const net      = Math.max(0, price - fee - shipping);

    // Skip payout release entirely when a carrier event lands on a disputed order — leave
    // payout_released=false so the existing dispute-resolution path (src/app/api/disputes/resolve)
    // is the one that ultimately decides whether the seller gets paid.
    const skipPayout = opts.source === 'carrier' && hasOpenDispute;

    let payout: { ok: boolean; payout_tx: string | null; error?: string } = { ok: false, payout_tx: null };
    if (!skipPayout) {
      // Derive the payout rail from pay_method when payout_method is NULL (pre-migration rows), so a
      // card sale never falls through to the crypto branch and vice-versa.
      const method = order.payout_method ?? (order.pay_method === 'card' ? 'card' : 'crypto');

      payout = await releasePayout({
        id: order.id,
        item_id: order.item_id,
        seller_wallet: order.seller_wallet,
        payout_method: method,
        seller_net_usd: net,
        gross_usd: price,
        received_lamports: order.received_lamports ?? null,
        stripe_payment_intent: order.stripe_payment_intent,
      });

      // Persist the payout result, retrying transient write failures. If this drifts (money moved but
      // the row says payout_released=false), the retry-payout endpoint would re-attempt — safe on the
      // card rail (idempotency key dedupes the transfer) but NOT on crypto, so we try hard to record it.
      let payoutWriteErr: { message?: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error: writeErr } = await supabase
          .from('orders')
          .update({
            seller_net_usd: net,
            payout_released: payout.ok,
            payout_tx: payout.payout_tx,
          })
          .eq('id', order.id);
        payoutWriteErr = writeErr;
        if (!writeErr) break;
      }
      if (payoutWriteErr) {
        console.error('[order-finalize] payout finished but result failed to persist after retries — MANUAL RECONCILIATION NEEDED:', payoutWriteErr, payout, { orderId: order.id, source: opts.source });
      }
    } else {
      // Still record the computed net so the eventual dispute-resolution payout has it precomputed;
      // payout_released stays false (its DB default / whatever it already was) — no payout write here.
      const { error: netWriteErr } = await supabase
        .from('orders')
        .update({ seller_net_usd: net })
        .eq('id', order.id);
      if (netWriteErr) {
        console.error('[order-finalize] could not persist seller_net_usd on disputed carrier-delivered order:', netWriteErr, { orderId: order.id });
      }
      console.warn('[order-finalize] carrier reported delivery but order has an open dispute — payout release skipped, pending dispute resolution:', { orderId: order.id });
    }

    await notify({
      recipient_wallet: order.seller_wallet,
      type: 'order_delivered',
      title: 'Delivery confirmed',
      body: skipPayout
        ? 'The carrier confirmed delivery, but payout is on hold pending an open dispute.'
        : payout.ok
          ? (opts.source === 'buyer'
              ? 'The buyer confirmed delivery — your payout has been released.'
              : 'The carrier confirmed delivery — your payout has been released.')
          : 'Delivery was confirmed.',
      link: '/dashboard',
      data: { order_id: order.id, net, source: opts.source },
    });
    void emailWallet(order.seller_wallet, orderDeliveredSeller({ itemId: order.item_id, netUsd: net, payoutReleased: payout.ok }));

    // Ask the buyer to review now that it's delivered — a stateless HMAC token deep-links them to a
    // one-click form. No-ops cleanly if REVIEW_TOKEN_SECRET isn't set. Best-effort marker so a resend
    // path (and audits) can tell the request already went out; never blocks the response. Sent
    // regardless of source or dispute status — the review ask is about the item/experience, not payout.
    const reviewToken = signReviewToken(order.id, order.buyer_wallet);
    if (reviewToken) {
      let productName: string | null = null;
      try {
        const { data: it } = await supabase.from('items').select('name').eq('id', order.item_id).single();
        productName = it?.name ?? null;
      } catch { /* name is optional */ }
      void emailWallet(order.buyer_wallet, reviewRequestBuyer({ itemId: order.item_id, productName, token: reviewToken }));
      // Best-effort marker; the error is ignored because review_request_sent_at may not be migrated
      // yet and the email has already gone out regardless.
      await supabase.from('orders').update({ review_request_sent_at: new Date().toISOString() }).eq('id', order.id);
    }

    return {
      ok: true,
      claimed: true,
      order: { ...order, status: 'delivered', seller_net_usd: net, payout_released: payout.ok },
      net,
      payout_released: payout.ok,
      payout_tx: payout.payout_tx,
      ...(payout.error ? { payout_error: payout.error } : {}),
      ...(skipPayout ? { payout_skipped_reason: 'open_dispute' as const } : {}),
    };
  } catch (err) {
    console.error('[order-finalize] error:', err);
    return { ok: false, error: 'Could not finalize delivery' };
  }
}
