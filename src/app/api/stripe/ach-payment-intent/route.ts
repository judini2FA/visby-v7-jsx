import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext, callerOwnsWallet } from '@/lib/auth';
import { isBanned } from '@/lib/account-status';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { achEnabled } from '@/lib/payable-tokens';
import { claimAchPayin, attachAchPayinPi, releaseAchPayin } from '@/lib/ach-payins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Blueprint 4.4 — ACH bank-debit pay-in. The buyer pays for an item straight from a bank account they
// linked via Financial Connections (4.1). Unlike card/crypto, an ACH debit SETTLES ASYNCHRONOUSLY
// (1–3 business days) and can still be returned (NSF), so this route only *initiates* the debit — the
// item is fulfilled later, in the Stripe webhook, ONLY on payment_intent.succeeded (funds cleared).
// Nothing is minted or transferred here. Dark-launched behind NEXT_PUBLIC_ACH_ENABLED.
export async function POST(req: Request) {
  try {
    if (!achEnabled()) return NextResponse.json({ error: 'Bank payments are not available yet.' }, { status: 403 });

    const { item_id, buyer_wallet, fc_account_id } = await req.json();
    if (!item_id || !buyer_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Auth: only the signed-in owner of buyer_wallet may pull money from their own linked bank.
    const ctx = await getAuthedContext(req);
    if (!ctx || !ctx.wallets.includes(buyer_wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Ban-freeze: a banned account can't move money. Fails open on a DB error (never strands a
    // legitimate buyer). Mirrors the other money routes.
    if (await isBanned(ctx.wallets)) return NextResponse.json({ error: 'account_banned' }, { status: 403 });

    const rl = await rateLimit(`ach-pi:${buyer_wallet}`, { limit: 8, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();

    const { data: item } = await supabase.from('items').select('*').eq('id', item_id).single();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (!item.is_listed || !item.price_usdc) return NextResponse.json({ error: 'This item is not for sale.' }, { status: 400 });
    if (item.current_owner_wallet === buyer_wallet) return NextResponse.json({ error: 'You already own this item' }, { status: 400 });

    // Buyer must have a Stripe customer + at least one linked bank (created during 4.1 bank-linking).
    const { data: cust } = await supabase
      .from('stripe_customers').select('stripe_customer_id').eq('wallet', buyer_wallet).maybeSingle();
    if (!cust?.stripe_customer_id) {
      return NextResponse.json({ error: 'Link a bank account first.', code: 'no_bank' }, { status: 400 });
    }

    let bankQuery = supabase
      .from('linked_bank_accounts')
      .select('fc_account_id, institution_name, last4')
      .eq('wallet', buyer_wallet)
      .eq('status', 'active');
    if (fc_account_id) bankQuery = bankQuery.eq('fc_account_id', fc_account_id);
    const { data: banks } = await bankQuery.order('created_at', { ascending: false }).limit(1);
    const bank = banks?.[0];
    if (!bank?.fc_account_id) {
      return NextResponse.json({ error: 'Link a bank account first.', code: 'no_bank' }, { status: 400 });
    }

    // Durable single-flight (survives the 1–3 day ACH settle window, unlike Stripe's 24h idempotency
    // key). Claim BEFORE moving any money so a re-submit on day 2 (page reload / second device) can't
    // start a second real debit. Released below if the PaymentIntent can't be created.
    const claim = await claimAchPayin(item.id, buyer_wallet);
    if (claim.inFlight) {
      return NextResponse.json({ error: 'You already have a bank payment in progress for this item — it’s still clearing.', code: 'ach_in_flight' }, { status: 409 });
    }
    if (!claim.ok || !claim.claimId) {
      return NextResponse.json({ error: 'Could not start the bank payment. Please try again.' }, { status: 500 });
    }
    const claimId = claim.claimId;

    const ip = clientIp(req);
    const ua = req.headers.get('user-agent') ?? undefined;

    // Derive a us_bank_account PaymentMethod from the linked (already instantly-verified) FC account,
    // attach it, then create + confirm the debit. Server-side confirm with an online mandate. The PI
    // lands in `processing` and only later transitions to `succeeded` (fulfill) or `payment_failed`.
    // Any failure here releases the single-flight claim so the buyer can retry. The idempotencyKey is a
    // second, shorter-lived guard against a fast double-submit within one request cycle.
    let pi: Stripe.PaymentIntent;
    try {
      const pm = await stripe.paymentMethods.create({
        type: 'us_bank_account',
        us_bank_account: { financial_connections_account: bank.fc_account_id },
        billing_details: { name: buyer_wallet },
      });
      await stripe.paymentMethods.attach(pm.id, { customer: cust.stripe_customer_id });

      pi = await stripe.paymentIntents.create(
        {
          amount: Math.round(item.price_usdc * 100),
          currency: 'usd',
          customer: cust.stripe_customer_id,
          payment_method: pm.id,
          payment_method_types: ['us_bank_account'],
          confirm: true,
          mandate_data: {
            customer_acceptance: {
              type: 'online',
              online: { ip_address: ip || '0.0.0.0', user_agent: ua || 'unknown' },
            },
          },
          metadata: {
            item_id:       item.id,
            buyer_wallet,
            price_usdc:    String(item.price_usdc),
            item_name:     item.name,
            seller_wallet: item.current_owner_wallet,
            pay_method:    'ach',
          },
        },
        { idempotencyKey: `ach-pi:${item.id}:${buyer_wallet}` },
      );
    } catch (payErr: any) {
      await releaseAchPayin(claimId);
      return NextResponse.json({ error: payErr?.message ?? 'Could not start the bank payment.' }, { status: 502 });
    }

    // Bind the PI to the claim so the webhook can terminal-state it on succeeded/failed. If this write
    // fails the debit is already in flight and WILL still fulfill (the webhook works off PI metadata,
    // not the claim), so never surface an error to the buyer — the orphan claim (pi_id NULL) blocks
    // duplicate attempts and self-heals after expiry. Log it CRITICALLY for reconciliation.
    try {
      await attachAchPayinPi(claimId, pi.id);
    } catch (attachErr) {
      console.error('[ach-payment-intent] CRITICAL: PI created but claim attach failed — orphan claim, PI will still fulfill:', { pi: pi.id, claimId, item_id: item.id, buyer_wallet, err: attachErr });
    }

    return NextResponse.json({
      ok: true,
      status: pi.status,               // expected 'processing'
      payment_intent_id: pi.id,
      bank: { institution_name: bank.institution_name, last4: bank.last4 },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Bank payment failed' }, { status: 500 });
  }
}
