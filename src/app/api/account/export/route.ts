import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { getAuthedContext } from '@/lib/auth';
import { isBanned } from '@/lib/account-status';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// CCPA/GDPR data export (blueprint Phase 8). Returns a JSON copy of the personal data Visby holds
// about the caller, across every table keyed to their linked wallets. Two hard rules:
//   1. NEVER select('*') on any table — every table lists an explicit safe-column allowlist, so a
//      secret column added later (a hash, token, provider payload, Stripe id) can't silently leak.
//   2. Every fetch is fail-soft: a broken/renamed table drops to [] and the rest of the export still
//      succeeds (a partial export beats a 500 that gives the user nothing).
// POST (not GET) so the bearer token stays out of URLs / server logs / browser history.

// wallet addresses are base58 (no commas/parens/spaces) so they're safe to interpolate into a PostgREST or() filter.
function orIn(cols: string[], wallets: string[]): string {
  const list = `(${wallets.join(',')})`;
  return cols.map((c) => `${c}.in.${list}`).join(',');
}

export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // A deleted/banned account is locked out of authenticated actions — including re-pulling an export.
  // (The delete route itself is deliberately NOT gated, so a partially-failed deletion can be re-run.)
  if (await isBanned(ctx.wallets)) return NextResponse.json({ error: 'account_banned' }, { status: 403 });

  const rl = await rateLimit(`data-export:${ctx.userId}`, { limit: 5, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const wallets = ctx.wallets;
  const supabase = createServiceClient();

  const safe = async <T,>(fn: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await fn();
      return error ? [] : (data ?? []);
    } catch {
      return [];
    }
  };

  const [
    profile, items, ownership_history, orders, transfers, reviews, disputes, kyc_verifications,
    shipping_addresses, payout_settings, linked_bank_accounts, likes, follows, messages,
    notifications, support_requests, sessions, push_tokens,
  ] = await Promise.all([
    // profile — the user's own PII is fine to hand back to them (no password/tokens: those live in account_security, never touched here).
    safe(() => supabase.from('profiles')
      .select('wallet, display_name, bio, avatar_url, username, preferred_currency, account_type, kyc_status, account_status, ship_to, ship_from, connected_wallets, tally_wallet, created_at')
      .in('wallet', wallets)),
    safe(() => supabase.from('items')
      .select('name, serial_number, category, condition, brand, is_listed, price_usdc, nft_mint_address, created_at')
      .in('current_owner_wallet', wallets)),
    safe(() => supabase.from('ownership_history')
      .select('item_id, event_type, tx_hash, price_usdc, created_at')
      .in('owner_wallet', wallets)),
    safe(() => supabase.from('orders')
      .select('id, item_id, buyer_wallet, seller_wallet, price_usdc, status, ship_name, ship_address, tracking_carrier, tracking_number, created_at')
      .or(orIn(['buyer_wallet', 'seller_wallet'], wallets))),
    safe(() => supabase.from('transfers')
      .select('from_wallet, to_wallet, to_handle, token, amount, kind, status, tx_hash, created_at')
      .or(orIn(['from_wallet', 'to_wallet'], wallets))),
    safe(() => supabase.from('reviews')
      .select('order_id, item_id, reviewer_wallet, seller_wallet, rating, comment, created_at')
      .or(orIn(['reviewer_wallet', 'seller_wallet'], wallets))),
    safe(() => supabase.from('disputes')
      .select('order_id, kind, reason, status, refund_amount_usd, created_at')
      .or(orIn(['buyer_wallet', 'seller_wallet'], wallets))),
    // kyc — status + inquiry_id ONLY. The `raw` provider payload (identity-document data) is deliberately excluded.
    safe(() => supabase.from('kyc_verifications')
      .select('account_type, provider, inquiry_id, status, reason, created_at')
      .in('wallet', wallets)),
    safe(() => supabase.from('shipping_addresses')
      .select('name, line1, line2, city, state, postal, country, label, is_default, created_at')
      .in('wallet', wallets)),
    // payout — routing preference only. stripe_account_id (a financial credential) is excluded.
    safe(() => supabase.from('payout_settings')
      .select('payout_type, crypto_wallet, crypto_chain, created_at')
      .in('seller_wallet', wallets)),
    // bank links — display metadata only. stripe_customer_id / fc_account_id (internal refs) excluded.
    safe(() => supabase.from('linked_bank_accounts')
      .select('institution_name, last4, status, created_at')
      .in('wallet', wallets)),
    safe(() => supabase.from('likes')
      .select('item_id, created_at')
      .in('wallet', wallets)),
    safe(() => supabase.from('follows')
      .select('follower_wallet, following_wallet, created_at')
      .or(orIn(['follower_wallet', 'following_wallet'], wallets))),
    safe(() => supabase.from('messages')
      .select('from_wallet, to_wallet, item_id, content, read, created_at')
      .or(orIn(['from_wallet', 'to_wallet'], wallets))),
    safe(() => supabase.from('notifications')
      .select('type, title, body, link, read, created_at')
      .in('recipient_wallet', wallets)),
    safe(() => supabase.from('support_requests')
      .select('subject, message, order_id, status, created_at')
      .in('wallet', wallets)),
    // login history — the user's own devices. fingerprint / ip are internal security signals, excluded.
    safe(() => supabase.from('device_sessions')
      .select('platform, user_agent, last_seen_at, created_at')
      .eq('user_id', ctx.userId)),
    // push registration — platform only; the device token value is a credential, excluded.
    safe(() => supabase.from('push_tokens')
      .select('platform, updated_at')
      .in('wallet', wallets)),
  ]);

  // Email isn't stored in our DB (it lives in Privy) — resolve it fail-soft so the export is complete.
  let email: string | null = null;
  try {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (appId && appSecret) {
      const user = await new PrivyClient(appId, appSecret).getUser(ctx.userId);
      const acct = (user.linkedAccounts ?? []).find((a: any) => a.type === 'email') as any;
      email = acct?.address ?? (user as any)?.email?.address ?? null;
    }
  } catch { /* non-fatal */ }

  const bundle = {
    export_generated_at: new Date().toISOString(),
    account: { privy_user_id: ctx.userId, wallets, email },
    profile,
    items,
    ownership_history,
    orders,
    transfers,
    reviews,
    disputes,
    kyc_verifications,
    shipping_addresses,
    payout_settings,
    linked_bank_accounts,
    likes,
    follows,
    messages,
    notifications,
    support_requests,
    sessions,
    push_tokens,
    notice:
      'This is a copy of the personal data Visby holds about you. Financial and provenance records ' +
      '(orders, transfers, disputes, KYC verifications, and minted items) are retained as required by ' +
      'tax and anti-money-laundering law even if you delete your account. Secret credentials (passwords, ' +
      'API keys, identity-document images, and payment tokens) are never included in this export.',
  };

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="visby-data-export.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
