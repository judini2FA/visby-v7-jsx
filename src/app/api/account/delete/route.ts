import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// CCPA/GDPR account deletion (blueprint Phase 8). Strategy:
//   ANONYMIZE the profiles row (null PII, account_status='deleted') rather than dropping it, so foreign
//   keys and the public provenance chain never break; getWorstStatus() maps 'deleted'->'banned', so the
//   account is locked out through the existing ban gate. HARD-DELETE the pure-PII tables. RETAIN the
//   financial / provenance / KYC records that tax + AML law require us to keep (they reference only a
//   pseudonymous wallet, not deletable identity data).
// Guards: an explicit typed "DELETE" confirmation (no accidental / CSRF deletion), and an obligation
// check that FAILS CLOSED — if we can't prove there are no in-flight orders or open disputes, we refuse.

function orIn(cols: string[], wallets: string[]): string {
  const list = `(${wallets.join(',')})`;
  return cols.map((c) => `${c}.in.${list}`).join(',');
}

export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`account-delete:${ctx.userId}`, { limit: 5, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== 'DELETE') {
    return NextResponse.json({ error: 'confirmation_required' }, { status: 400 });
  }

  const wallets = ctx.wallets;
  const supabase = createServiceClient();
  const orWallets = orIn(['buyer_wallet', 'seller_wallet'], wallets);

  // ── Obligation guard (fail-closed) ── never delete an account mid-transaction.
  const [inflight, deliveredEscrow, openDisputes] = await Promise.all([
    supabase.from('orders').select('id').or(orWallets).in('status', ['paid', 'shipped']),
    // 'delivered' is NOT terminal: a delivered order whose payout hasn't been released still holds escrow
    // that can resolve to a refund. Deleting mid-escrow would strand those funds, so it blocks too.
    supabase.from('orders').select('id').or(orWallets).eq('status', 'delivered').eq('payout_released', false),
    supabase.from('disputes').select('id').or(orWallets).in('status', ['open', 'under_review']),
  ]);
  if (inflight.error || deliveredEscrow.error || openDisputes.error) {
    return NextResponse.json(
      { error: 'guard_unavailable', message: 'Could not verify your account state right now. Please try again shortly.' },
      { status: 503 },
    );
  }
  const blockers: string[] = [];
  const nOrders = (inflight.data?.length ?? 0) + (deliveredEscrow.data?.length ?? 0);
  const nDisputes = openDisputes.data?.length ?? 0;
  if (nOrders > 0) blockers.push(`${nOrders} order${nOrders === 1 ? '' : 's'} still in progress`);
  if (nDisputes > 0) blockers.push(`${nDisputes} open dispute${nDisputes === 1 ? '' : 's'}`);
  if (blockers.length) {
    return NextResponse.json(
      { error: 'has_open_obligations', blockers, message: `Please resolve these before deleting your account: ${blockers.join(' and ')}.` },
      { status: 409 },
    );
  }

  // ── Anonymize the profile (also flips the lockout) ── this is the critical step: it removes profile
  // PII AND sets account_status='deleted'. If it fails on every wallet, abort — we won't report success
  // for an account that's neither scrubbed nor locked.
  const now = new Date().toISOString();
  const scrub = {
    display_name: null,
    bio: null,
    avatar_url: null,
    username: null,
    ship_to: null,
    ship_from: null,
    connected_wallets: [] as unknown[],
    tally_wallet: null,
    payment_order: [] as unknown[],
    account_status: 'deleted',
    deleted_at: now,
    moderation_reason: 'Account deleted at the user’s request',
  };
  let scrubbed = 0;
  for (const w of wallets) {
    const { error } = await supabase.from('profiles').update(scrub).eq('wallet', w);
    if (!error) scrubbed += 1;
    else console.error('[account/delete] profile scrub failed for', w, error.message);
  }
  if (scrubbed === 0) {
    return NextResponse.json(
      { error: 'deletion_failed', message: 'We could not delete your account right now. Please try again or contact support.' },
      { status: 500 },
    );
  }

  // ── Hard-delete the pure-PII tables (best-effort; a missing/renamed table is logged, never fatal) ──
  const singleCol: Array<{ table: string; col: string }> = [
    { table: 'account_security', col: 'wallet' },       // password hash + reset tokens
    { table: 'push_tokens', col: 'wallet' },            // device push tokens
    { table: 'payout_settings', col: 'seller_wallet' }, // payout routing prefs
    { table: 'shipping_addresses', col: 'wallet' },     // saved addresses
    { table: 'stripe_customers', col: 'wallet' },       // stripe customer mapping
    { table: 'linked_bank_accounts', col: 'wallet' },   // bank link metadata
    { table: 'security_audit_log', col: 'wallet' },     // login/reset audit trail
    { table: 'likes', col: 'wallet' },                  // favorited items
    { table: 'notifications', col: 'recipient_wallet' },// in-app notifications
    { table: 'item_views', col: 'viewer_wallet' },      // view analytics
    { table: 'support_requests', col: 'wallet' },       // help tickets (contain email/message PII)
    // messages + payment_requests are scoped to the rows the user AUTHORED. Deleting by the recipient side
    // too (an OR over both wallets) would erase the COUNTERPARTY's own authored content — a message they
    // sent us, or a "request money" note they wrote — so we only remove what this user created.
    { table: 'messages', col: 'from_wallet' },              // messages the user sent
    { table: 'payment_requests', col: 'requester_wallet' }, // "request money" notes the user authored
  ];
  const multiCol: Array<{ table: string; cols: string[] }> = [
    // A follow is a single relationship edge (not content owned by both sides); once this account is gone
    // both directions are dangling, so removing edges where the user is either side is correct cleanup.
    { table: 'follows', cols: ['follower_wallet', 'following_wallet'] },
  ];

  const purged: string[] = [];
  const failed: string[] = [];
  const del = async (table: string, run: () => PromiseLike<{ error: unknown }>) => {
    try {
      const { error } = await run();
      if (error) { failed.push(table); console.error('[account/delete] delete failed:', table, (error as any)?.message); }
      else purged.push(table);
    } catch (e) {
      failed.push(table);
      console.error('[account/delete] delete threw:', table, e);
    }
  };

  for (const { table, col } of singleCol) {
    await del(table, () => supabase.from(table).delete().in(col, wallets));
  }
  for (const { table, cols } of multiCol) {
    await del(table, () => supabase.from(table).delete().or(orIn(cols, wallets)));
  }
  // device_sessions: keyed by the Privy user_id (its wallet column is nullable), so purge by user_id.
  await del('device_sessions', () => supabase.from('device_sessions').delete().eq('user_id', ctx.userId));

  return NextResponse.json({
    ok: true,
    deleted: true,
    purged,
    failed,
    retained: ['orders', 'transfers', 'disputes', 'dispute_evidence', 'reviews', 'kyc_verifications', 'items', 'ownership_history'],
    notice:
      'Your account is deleted and you have been signed out. Personal data has been removed. Financial and ' +
      'provenance records are retained as required by tax and anti-money-laundering law. On-chain ownership ' +
      'records (your Tallys) are permanent and cannot be erased from the blockchain.',
  });
}
