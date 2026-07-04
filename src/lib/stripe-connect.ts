import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { captureError } from '@/lib/monitoring';

// Blueprint 4.3 — Stripe Connect (Express) fiat payout rail for sellers.
//
// This is a seller-opt-in ADDITION alongside the existing crypto (SOL-to-wallet) payout in
// src/lib/payout.ts, which stays the default. A seller only lands on this rail once they've
// (a) completed Connect onboarding (payouts_enabled=true on seller_connect_accounts) AND
// (b) set payout_settings.payout_type = 'bank'. See releasePayout() in payout.ts for the branch.
//
// Fail-soft throughout: every helper here returns a result object / null rather than throwing,
// so a Stripe hiccup never crashes a caller — callers decide whether to surface an error to the UI
// or (in payout.ts's case) fall back to leaving the payout unreleased for retry.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export type SellerConnectAccount = {
  wallet: string;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

// Look up (or lazily create) the Connect Express account for a seller wallet, persisting the new
// stripe_account_id immediately so a crash between create() and the DB write can't orphan an
// account Stripe knows about but we don't. Idempotent: repeated calls for the same wallet reuse
// the existing account_id rather than creating duplicates.
export async function getOrCreateConnectAccount(wallet: string): Promise<{ ok: boolean; stripe_account_id?: string; error?: string }> {
  if (!wallet) return { ok: false, error: 'Missing wallet' };
  const supabase = createServiceClient();

  try {
    const { data: existing } = await supabase
      .from('seller_connect_accounts')
      .select('stripe_account_id')
      .eq('wallet', wallet)
      .maybeSingle();

    if (existing?.stripe_account_id) return { ok: true, stripe_account_id: existing.stripe_account_id };

    const account = await stripe.accounts.create({
      type: 'express',
      capabilities: { transfers: { requested: true } },
      business_type: 'individual',
      metadata: { visby_wallet: wallet },
    });

    const { error: upsertErr } = await supabase
      .from('seller_connect_accounts')
      .upsert(
        { wallet, stripe_account_id: account.id, updated_at: new Date().toISOString() },
        { onConflict: 'wallet' }
      );
    if (upsertErr) {
      // Account exists at Stripe but we failed to record it — surface loudly, don't silently drop it.
      captureError(new Error('seller_connect_accounts upsert failed after account create'), {
        stage: 'getOrCreateConnectAccount', wallet, stripe_account_id: account.id, db_error: upsertErr.message,
      });
      return { ok: false, error: 'Could not save Connect account — please retry.' };
    }

    return { ok: true, stripe_account_id: account.id };
  } catch (err) {
    captureError(err, { stage: 'getOrCreateConnectAccount', wallet });
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create Connect account' };
  }
}

// Create a fresh onboarding (or re-onboarding) link for the seller's Express account.
export async function createOnboardingLink(
  wallet: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const acct = await getOrCreateConnectAccount(wallet);
  if (!acct.ok || !acct.stripe_account_id) return { ok: false, error: acct.error ?? 'No Connect account' };

  try {
    const link = await stripe.accountLinks.create({
      account: acct.stripe_account_id,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: 'account_onboarding',
    });
    return { ok: true, url: link.url };
  } catch (err) {
    captureError(err, { stage: 'createOnboardingLink', wallet, stripe_account_id: acct.stripe_account_id });
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create onboarding link' };
  }
}

// Re-pull the account's verification status from Stripe (the source of truth) and persist it.
// Call this from the Connect return_url landing page and/or a status-check route — Stripe doesn't
// push webhooks into this build yet, so status is refreshed on-demand rather than event-driven.
export async function refreshConnectStatus(wallet: string): Promise<{ ok: boolean; account?: SellerConnectAccount; error?: string }> {
  const supabase = createServiceClient();

  try {
    const { data: existing } = await supabase
      .from('seller_connect_accounts')
      .select('stripe_account_id')
      .eq('wallet', wallet)
      .maybeSingle();

    if (!existing?.stripe_account_id) return { ok: false, error: 'No Connect account on file for this wallet' };

    const account = await stripe.accounts.retrieve(existing.stripe_account_id);
    const row = {
      wallet,
      stripe_account_id: account.id,
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      details_submitted: !!account.details_submitted,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from('seller_connect_accounts')
      .upsert(row, { onConflict: 'wallet' });
    if (upsertErr) {
      captureError(new Error('seller_connect_accounts status upsert failed'), { stage: 'refreshConnectStatus', wallet, db_error: upsertErr.message });
      return { ok: false, error: 'Could not save updated status' };
    }

    return { ok: true, account: row };
  } catch (err) {
    captureError(err, { stage: 'refreshConnectStatus', wallet });
    return { ok: false, error: err instanceof Error ? err.message : 'Could not refresh Connect status' };
  }
}

// Read the persisted Connect status without hitting Stripe (cheap path for releasePayout's gate).
export async function getConnectStatus(wallet: string): Promise<SellerConnectAccount | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('seller_connect_accounts')
    .select('wallet, stripe_account_id, charges_enabled, payouts_enabled, details_submitted')
    .eq('wallet', wallet)
    .maybeSingle();
  return (data as SellerConnectAccount | null) ?? null;
}

export type ConnectPayoutResult = { ok: boolean; transfer_id?: string; error?: string };

// Move `amountUsd` from the Visby platform balance to the seller's connected account. This is a
// MONEY-OUT call — idempotencyKey is REQUIRED so a retried release (e.g. after a transient network
// error, or the retry-payout endpoint re-firing) can never double-transfer for the same order.
export async function payoutToConnect(args: { wallet: string; amountUsd: number; idempotencyKey: string }): Promise<ConnectPayoutResult> {
  const { wallet, amountUsd, idempotencyKey } = args;
  if (!wallet) return { ok: false, error: 'Missing wallet' };
  if (!idempotencyKey) return { ok: false, error: 'Missing idempotencyKey' };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return { ok: false, error: 'Invalid amount' };

  const status = await getConnectStatus(wallet);
  if (!status?.stripe_account_id) return { ok: false, error: 'Seller has not connected a Stripe bank payout account.' };
  if (!status.payouts_enabled) return { ok: false, error: 'Stripe Connect account not yet enabled for payouts — onboarding incomplete.' };

  const cents = Math.round(amountUsd * 100);
  if (cents <= 0) return { ok: false, error: 'Invalid amount' };

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: cents,
        currency: 'usd',
        destination: status.stripe_account_id,
        description: 'Visby seller payout',
        metadata: { visby_wallet: wallet },
      },
      { idempotencyKey }
    );
    return { ok: true, transfer_id: transfer.id };
  } catch (err) {
    captureError(err, { stage: 'payoutToConnect', wallet, amountUsd });
    return { ok: false, error: err instanceof Error ? err.message : 'Connect transfer failed' };
  }
}
