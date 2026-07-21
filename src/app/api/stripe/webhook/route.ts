import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { fulfillPurchase } from '@/lib/fulfill';
import { captureError, captureMessage } from '@/lib/monitoring';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications';
import { emailWallet } from '@/lib/email';
import { refundIssuedBuyer, achPaymentFailedBuyer } from '@/lib/email-templates';
import { markAchPayinByPi } from '@/lib/ach-payins';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const sig  = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status !== 'paid') {
        return NextResponse.json({ ok: true });
      }

      const { item_id, buyer_wallet, price_usdc } = session.metadata ?? {};
      if (!item_id || !buyer_wallet) {
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      const sessPi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      await fulfillPurchase(item_id, buyer_wallet, price_usdc, sessPi);
    } else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const { item_id, buyer_wallet, price_usdc } = pi.metadata ?? {};

      if (!item_id || !buyer_wallet) {
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      // 4.9 Stripe Tax: finalize the tax transaction from the calculation so it's reported/remitted.
      // Only fires when the PI carried a tax_calc_id (i.e. tax was enabled at checkout). Best-effort and
      // idempotent by reference — a failure here must never block fulfillment.
      if (pi.metadata?.tax_calc_id) {
        try {
          await stripe.tax.transactions.createFromCalculation({ calculation: pi.metadata.tax_calc_id, reference: `order:${pi.id}` });
        } catch (taxErr) {
          captureError(taxErr, { stage: 'tax.createFromCalculation', pi: pi.id });
        }
      }

      if (pi.metadata?.pay_method === 'ach') {
        // ACH funds have now cleared (this fires days after the debit). Fulfill; but if the 1-of-1 sold
        // to an instant card/crypto buyer during the settle window, the buyer can't get it — refund the
        // ACH in full (no loss to Visby) instead of erroring forever. A TRANSIENT fulfill failure (e.g.
        // a Solana RPC blip) is rethrown so Stripe retries the webhook — we only refund on a genuine
        // sold-away, detected by the item now being owned by someone else.
        const sellerWallet = pi.metadata?.seller_wallet;
        const supabase = createServiceClient();

        // Redundant-debit guard. If the buyer ALREADY owns this item, this succeeded ACH is one of two
        // things: (a) a webhook REDELIVERY of the very PI that bought it — a harmless no-op; or (b) a
        // SECOND payment for an item already delivered by a different PI/rail — which must be refunded
        // (never keep a duplicate charge). Distinguish by comparing the delivering order's payment
        // intent to this one, so a redelivery can never trigger a wrong refund.
        const { data: preItem } = await supabase
          .from('items').select('current_owner_wallet').eq('id', item_id).maybeSingle();

        if (preItem?.current_owner_wallet === buyer_wallet) {
          const { data: order } = await supabase
            .from('orders').select('stripe_payment_intent')
            .eq('item_id', item_id).eq('buyer_wallet', buyer_wallet)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();

          // Refund ONLY when a DIFFERENT payment provably delivered this item — i.e. an order row EXISTS
          // whose payment intent isn't this PI (a crypto sale's order carries a null stripe_payment_intent;
          // a card/other-ACH sale's carries a different one — both are "a different payment"). If the
          // order's PI equals this one it's a webhook REDELIVERY of the paying PI (no-op). If NO order
          // exists we can't prove a different payment delivered it — this very ACH may have delivered the
          // item with its order-write failing — so we must NOT auto-refund (that would hand the buyer the
          // item for free); log for manual reconciliation instead.
          if (order && order.stripe_payment_intent !== pi.id) {
            await stripe.refunds.create({ payment_intent: pi.id }, { idempotencyKey: `ach-refund:${pi.id}` });
            await markAchPayinByPi(pi.id, 'refunded');
            const priceNum = price_usdc ? parseFloat(price_usdc) : null;
            void notify({
              recipient_wallet: buyer_wallet,
              type: 'ach_refunded',
              title: 'Bank payment refunded',
              body: 'This item was already paid for, so we refunded your bank payment in full.',
              link: '/item/' + item_id,
              data: { item_id, payment_intent: pi.id },
            });
            void emailWallet(buyer_wallet, refundIssuedBuyer({ itemId: item_id, priceUsd: priceNum }));
          } else {
            if (!order) {
              console.error('[stripe webhook] ACH succeeded and buyer owns the item but no order was found — NOT auto-refunding; manual reconcile:', { payment_intent: pi.id, item_id, buyer_wallet });
            }
            await markAchPayinByPi(pi.id, 'succeeded'); // redelivery of the paying PI, or unprovable — do not refund
          }
        } else {
          try {
            await fulfillPurchase(item_id, buyer_wallet, price_usdc, pi.id, { pay_method: 'ach' });
            await markAchPayinByPi(pi.id, 'succeeded');
          } catch (fulfillErr) {
            const { data: item } = await supabase
              .from('items').select('current_owner_wallet, is_listed').eq('id', item_id).maybeSingle();
            // Genuine sold-away = the item now belongs to a THIRD PARTY — neither this buyer nor the
            // original seller. An item merely delisted while still owned by the seller (a seller pause
            // or an admin/moderation delist) is TRANSIENT: rethrow so Stripe retries and a relist within
            // the window still fulfills the paid buyer. Only a true third-party sale refunds — so we
            // never refund a buyer whose funds cleared and who could still receive the item.
            const soldAway = !!item && !!sellerWallet
              && item.current_owner_wallet !== buyer_wallet
              && item.current_owner_wallet !== sellerWallet;
            if (!soldAway) throw fulfillErr; // transient / seller-paused — let Stripe retry, don't refund

            await stripe.refunds.create({ payment_intent: pi.id }, { idempotencyKey: `ach-refund:${pi.id}` });
            await markAchPayinByPi(pi.id, 'refunded');
            const priceNum = price_usdc ? parseFloat(price_usdc) : null;
            void notify({
              recipient_wallet: buyer_wallet,
              type: 'ach_refunded',
              title: 'Bank payment refunded',
              body: 'The item sold before your bank transfer cleared, so we refunded your payment in full.',
              link: '/item/' + item_id,
              data: { item_id, payment_intent: pi.id },
            });
            void emailWallet(buyer_wallet, refundIssuedBuyer({ itemId: item_id, priceUsd: priceNum }));
          }
        }
      } else {
        await fulfillPurchase(item_id, buyer_wallet, price_usdc, pi.id);
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      // ACH return / bank decline (fires days after a `processing` debit for NSF etc.). Nothing was
      // fulfilled — the buyer never gets the item on this rail and isn't left charged — so just tell
      // them their bank payment didn't go through. Only our own ACH PIs carry pay_method:'ach'.
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.pay_method === 'ach') {
        const { item_id, buyer_wallet } = pi.metadata ?? {};
        await markAchPayinByPi(pi.id, 'failed'); // frees the single-flight slot so the buyer can retry
        if (item_id && buyer_wallet) {
          void notify({
            recipient_wallet: buyer_wallet,
            type: 'ach_failed',
            title: 'Bank payment didn’t go through',
            body: 'Your bank declined or returned the transfer, so your purchase wasn’t completed. No item was transferred.',
            link: '/item/' + item_id,
            data: { item_id, payment_intent: pi.id },
          });
          void emailWallet(buyer_wallet, achPaymentFailedBuyer({ itemId: item_id }));
        }
      }
    } else if (event.type === 'payment_intent.canceled') {
      // A `canceled` PI is a terminal state distinct from `payment_failed` (Stripe can cancel an ACH PI
      // whose mandate/verification path is abandoned). Free the single-flight slot — otherwise the claim
      // stays 'processing' forever (its pi_id is non-null, so the orphan-heal can't reclaim it) and the
      // buyer could never retry ACH on that item. No money moved, so no fulfillment/refund needed.
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.pay_method === 'ach') {
        await markAchPayinByPi(pi.id, 'failed');
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    captureError(err, { stage: 'stripe webhook fulfill', event_type: event.type });
    // Distinct, stable alert signal so a Sentry/alert rule can fire on repeated webhook processing
    // failures — the early warning that turns a silent multi-day failure (which auto-disables the
    // endpoint) into something caught within the hour. Returning 5xx tells Stripe to re-deliver.
    captureMessage('error', 'ALERT stripe_webhook_processing_failed', {
      alert: 'stripe_webhook_processing_failed',
      event_type: event.type,
      event_id: event.id,
    });
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
