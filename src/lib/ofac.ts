import { createServiceClient } from '@/lib/supabase/service';
import { captureError, captureMessage } from '@/lib/monitoring';

// OFAC sanctions screening (blueprint 6.4). Screens a payout destination wallet against the OFAC SDN list
// of designated Solana addresses — free public U.S. Treasury data, no vendor/API key. The list is pulled
// nightly (refreshOfacSanctions) from the maintained 0xB10C feed, which regenerates from the official
// Treasury sdn_advanced.xml. This is an EXACT-MATCH blocklist (the legal floor), NOT fund-tracing/risk
// scoring — a wallet that merely received funds from a sanctioned source is not flagged.
//
// Rollout: gated behind OFAC_SCREENING_ENABLED. Off (default) → releasePayout is byte-identical to before
// (screen skipped). On → the payout path fails CLOSED: a sanctioned hit OR an untrustworthy list (empty /
// stale / unreadable) HOLDS the payout rather than releasing funds unscreened.

const SOL_LIST_URL =
  'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_SOL.txt';

// Guard a malformed env value: Number('7d')/Number('true') → NaN would make the staleness check never
// fire (age > NaN is always false) and silently disable freshness (fail-open). Fall back to 7 on anything
// non-finite or non-positive.
const _staleDays = Number(process.env.OFAC_STALE_DAYS);
const STALE_DAYS = Number.isFinite(_staleDays) && _staleDays > 0 ? _staleDays : 7;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

// Solana base58 pubkey shape — the feed is one address per line; ignore comments / malformed lines.
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function ofacScreeningEnabled(): boolean {
  return process.env.OFAC_SCREENING_ENABLED === '1';
}

// Pull the current OFAC Solana blocklist and replace our stored set. Race-safe: upserts the new set FIRST
// (table is never empty mid-refresh), then prunes addresses OFAC has delisted. Refuses an empty/failed
// download so a transient outage can never wipe a good list into a fail-open state.
export async function refreshOfacSanctions(): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(SOL_LIST_URL, {
        headers: { 'User-Agent': 'Visby-OFAC-Refresh/1.0' },
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return { ok: false, count: 0, error: `fetch_${res.status}` };
    const text = await res.text();
    const addrs = Array.from(
      new Set(text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && SOL_ADDR.test(l))),
    );
    // A malformed/empty parse must NOT overwrite a good list (that would fail the screen OPEN). Bail.
    if (addrs.length === 0) return { ok: false, count: 0, error: 'empty_parse' };

    const supabase = createServiceClient();

    // Guard a truncated/partial-but-nonempty download: if the fetched set collapses far below the last
    // known count, refuse the WHOLE refresh (no upsert, no prune, no fresh stamp) so a bad download can't
    // delete the real blocklist into a fail-open state. A genuine mass-delisting is rare and hand-checkable
    // — better to hold on a loud alert than to silently empty the list.
    const { data: prevMeta } = await supabase.from('ofac_refresh_meta').select('address_count').eq('id', 1).maybeSingle();
    const prev = prevMeta?.address_count ?? 0;
    if (prev >= 5 && addrs.length < Math.ceil(prev * 0.5)) {
      captureMessage('error', `[ofac] refresh REFUSED — suspicious shrink ${prev} -> ${addrs.length}`, { prev, now: addrs.length });
      return { ok: false, count: 0, error: 'suspicious_shrink' };
    }

    const rows = addrs.map((address) => ({ address, asset: 'SOL', source: 'ofac-sdn/0xB10C' }));
    const { error: upErr } = await supabase.from('ofac_sanctioned_addresses').upsert(rows, { onConflict: 'address' });
    if (upErr) return { ok: false, count: 0, error: upErr.message };

    // Prune delisted addresses (upsert already ran, so there's no empty window).
    const { data: existing } = await supabase.from('ofac_sanctioned_addresses').select('address').eq('asset', 'SOL');
    const keep = new Set(addrs);
    const toDelete = (existing ?? []).map((r: any) => r.address as string).filter((a) => !keep.has(a));
    if (toDelete.length) await supabase.from('ofac_sanctioned_addresses').delete().in('address', toDelete);

    await supabase.from('ofac_refresh_meta').upsert({
      id: 1,
      last_refreshed_at: new Date().toISOString(),
      address_count: addrs.length,
      source: 'ofac-sdn/0xB10C',
    });
    return { ok: true, count: addrs.length };
  } catch (err) {
    captureError(err, { stage: 'refreshOfacSanctions' });
    return { ok: false, count: 0, error: err instanceof Error ? err.message : 'refresh_failed' };
  }
}

export type ScreenDecision = { decision: 'clear' | 'blocked' | 'hold'; reason?: string; address?: string };

// The list is trustworthy only if it's populated AND recently refreshed. Anything else → not usable →
// the caller holds (fail-closed). This is what makes a broken cron surface as held payouts + alerts
// rather than silently unscreened releases.
async function screeningUsable(supabase: ReturnType<typeof createServiceClient>): Promise<{ usable: boolean; reason?: string }> {
  const { data, error } = await supabase
    .from('ofac_refresh_meta')
    .select('last_refreshed_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) return { usable: false, reason: 'meta_error' };
  if (!data || !data.last_refreshed_at) return { usable: false, reason: 'never_refreshed' };
  const age = Date.now() - new Date(data.last_refreshed_at).getTime();
  if (!Number.isFinite(age) || !Number.isFinite(STALE_MS) || age > STALE_MS) return { usable: false, reason: 'stale_list' };
  // 'Populated' MUST be proven by the table we actually screen — never by a counter in a separate table.
  // Otherwise a drift (blocklist emptied while meta still reads fresh) would silently fail OPEN.
  const { count, error: cntErr } = await supabase
    .from('ofac_sanctioned_addresses')
    .select('address', { count: 'exact', head: true });
  if (cntErr) return { usable: false, reason: 'list_read_error' };
  if (!count || count <= 0) return { usable: false, reason: 'empty_list' };
  return { usable: true };
}

// Fail-CLOSED screen for the payout path. Returns 'blocked' on a sanctioned hit, 'hold' when the list
// can't be trusted (missing / empty / stale / any error), 'clear' only when a trustworthy list has no
// match. NEVER throws — a screening failure must never fall through to releasing funds.
export async function screenPayoutWallet(address: string): Promise<ScreenDecision> {
  try {
    if (!address) return { decision: 'hold', reason: 'no_address' };
    const supabase = createServiceClient();
    const usable = await screeningUsable(supabase);
    if (!usable.usable) return { decision: 'hold', reason: usable.reason };
    // Exact match — base58 is case-sensitive, so compare the raw string (no normalization).
    const { data, error } = await supabase
      .from('ofac_sanctioned_addresses')
      .select('address')
      .eq('address', address)
      .maybeSingle();
    if (error) return { decision: 'hold', reason: 'query_error' };
    if (data) return { decision: 'blocked', reason: 'ofac_match', address };
    return { decision: 'clear' };
  } catch (err) {
    captureError(err, { stage: 'screenPayoutWallet' });
    return { decision: 'hold', reason: 'exception' }; // fail-closed
  }
}

// Record a held/blocked payout for admin review. One row per order (upsert) so retries don't duplicate;
// alerts only on the FIRST hold for an order so a retry loop doesn't spam the alert sink.
export async function recordPayoutHold(order: { id: string; seller_wallet: string }, screen: ScreenDecision): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: existing } = await supabase.from('payout_holds').select('id, status').eq('order_id', order.id).maybeSingle();
    await supabase.from('payout_holds').upsert(
      {
        order_id: order.id,
        seller_wallet: order.seller_wallet,
        reason: screen.decision === 'blocked' ? 'ofac_match' : (screen.reason ?? 'screening_unavailable'),
        matched_address: screen.address ?? null,
        status: 'open',
      },
      { onConflict: 'order_id' },
    );
    if (!existing) {
      captureMessage('error', `[ofac] payout HELD for order ${order.id}`, {
        decision: screen.decision,
        reason: screen.reason,
        seller_wallet: order.seller_wallet,
        matched_address: screen.address,
      });
    }
  } catch (err) {
    captureError(err, { stage: 'recordPayoutHold', order_id: order.id });
  }
}
