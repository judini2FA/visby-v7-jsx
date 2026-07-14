import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications';
import { USDC_MINT, USDC_DECIMALS } from '@/lib/usdc';

export type TransferToken = 'SOL' | 'USDC';

const isSolAddr = (a: unknown): a is string =>
  typeof a === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);

function rpcUrl(): string {
  return process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
}

// Per-token caps (in the token's own units). A guardrail on the Visby send flow — NOT a custody control
// (non-custodial: a user can always move their own crypto outside the app). Override with TRANSFER_LIMITS
// JSON, e.g. {"SOL":{"perTx":5,"daily":20},"USDC":{"perTx":1000,"daily":5000}}.
const DEFAULT_LIMITS: Record<TransferToken, { perTx: number; daily: number }> = {
  SOL: { perTx: 10, daily: 50 },
  USDC: { perTx: 2000, daily: 10000 },
};

function limitsFor(token: TransferToken): { perTx: number; daily: number } {
  try {
    const raw = process.env.TRANSFER_LIMITS;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.[token]?.perTx != null && parsed?.[token]?.daily != null) return parsed[token];
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_LIMITS[token];
}

export type ResolvedRecipient = { wallet: string; handle: string | null; display_name: string | null; avatar_url: string | null };

// Resolve a destination from a raw Solana address OR a Visby handle (display_name). Every profile is keyed
// on the user's primary Solana wallet, so a resolved profile IS a valid crypto destination. Returns null
// when nothing matches or the match has no usable wallet (honest "this user can't receive crypto yet").
export async function resolveRecipient(to: string): Promise<ResolvedRecipient | null> {
  const q = (to ?? '').trim();
  if (!q) return null;
  const supabase = createServiceClient();

  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) {
    const { data } = await supabase.from('profiles').select('wallet, display_name, avatar_url').eq('wallet', q).maybeSingle();
    return { wallet: q, handle: null, display_name: data?.display_name ?? null, avatar_url: data?.avatar_url ?? null };
  }

  // username is unique (migration_username.sql, case-insensitive) with charset [a-z0-9_], so an exact
  // match resolves unambiguously — try it FIRST, derived from the RAW handle (minus a leading '@'). We must
  // NOT reuse the display_name-sanitized `safe` below: it deletes '_', which is valid in usernames, so
  // `cool_guy` would silently miss. `.eq` on the lowercased candidate is exact and injection-free (a
  // format-validated [a-z0-9_] string carries no LIKE wildcards).
  const unameCandidate = q.replace(/^@/, '').toLowerCase();
  if (/^[a-z0-9_]{3,20}$/.test(unameCandidate)) {
    const { data: byUsername, error: unameErr } = await supabase
      .from('profiles')
      .select('wallet, username, display_name, avatar_url')
      .eq('username', unameCandidate)
      .limit(2);
    // Column may not exist pre-migration (42703/PGRST204) — fall through to display_name in that case.
    if (!unameErr) {
      const unameMatches = (byUsername ?? []).filter((r: any) => isSolAddr(r.wallet));
      if (unameMatches.length === 1) {
        const only = unameMatches[0] as any;
        return { wallet: only.wallet, handle: only.username ?? q, display_name: only.display_name ?? null, avatar_url: only.avatar_url ?? null };
      }
    }
  }

  // Strip LIKE metacharacters (incl. `_`, the single-char wildcard) so the display_name handle matches
  // LITERALLY, not as a pattern. ilike with no `%` is then a case-insensitive exact match.
  const safe = q.slice(0, 60).replace(/[%_,()*\\]/g, ' ').trim();
  if (!safe) return null;

  // display_name is NOT unique. Fetch up to 2 and REFUSE to guess a money destination when it's ambiguous
  // (>1 match) — the user must use a wallet address or pick from their wallet-keyed Recents/Following list.
  const { data } = await supabase
    .from('profiles')
    .select('wallet, display_name, avatar_url')
    .ilike('display_name', safe)
    .limit(2);
  const matches = (data ?? []).filter((r: any) => isSolAddr(r.wallet));
  if (matches.length !== 1) return null;
  const only = matches[0] as any;
  return { wallet: only.wallet, handle: q, display_name: only.display_name ?? null, avatar_url: only.avatar_url ?? null };
}

// Sum of today's (UTC) outgoing amounts for a wallet in one token. All 'sent' count; a 'pending' counts
// only while recent — an abandoned/timed-out prepare ages out after PENDING_TTL_MS so it can't permanently
// eat the user's daily headroom. (Pending still counts briefly so a burst of prepares can't slip the cap.)
const PENDING_TTL_MS = 15 * 60 * 1000;
async function dailyUsed(fromWallet: string, token: TransferToken): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const cutoff = new Date(Date.now() - PENDING_TTL_MS).toISOString();
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('transfers')
    .select('amount, status, created_at')
    .eq('from_wallet', fromWallet)
    .eq('token', token)
    .in('status', ['pending', 'sent'])
    .gte('created_at', since.toISOString());
  return (data ?? []).reduce((s: number, r: any) => {
    if (r.status === 'sent') return s + Number(r.amount || 0);
    return r.created_at >= cutoff ? s + Number(r.amount || 0) : s;
  }, 0);
}

export async function checkLimits(fromWallet: string, token: TransferToken, amount: number): Promise<{ ok: boolean; reason?: string }> {
  const { perTx, daily } = limitsFor(token);
  if (!(amount > 0)) return { ok: false, reason: 'invalid_amount' };
  if (amount > perTx) return { ok: false, reason: `per_tx_limit:${perTx}` };
  const used = await dailyUsed(fromWallet, token);
  if (used + amount > daily) return { ok: false, reason: `daily_limit:${daily}` };
  return { ok: true };
}

// Atomic check-and-record via the prepare_transfer_atomic RPC (migration_transfer_atomic.sql): the daily
// cap and the insert happen in ONE transaction serialized per wallet+token, so concurrent prepares can't
// each read the same usage and all slip past the cap (the checkLimits→recordPrepared TOCTOU). Until the
// migration runs the RPC doesn't exist — fall back to the legacy two-step path so sends keep working.
export async function prepareAtomic(row: {
  idempotency_key: string; from_wallet: string; to_wallet: string; to_handle: string | null;
  token: TransferToken; amount: number; kind: 'p2p' | 'self';
}): Promise<{ ok: true; id: string; existing: boolean } | { ok: false; reason: string } | null> {
  const { perTx, daily } = limitsFor(row.token);
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('prepare_transfer_atomic', {
    p_idempotency_key: row.idempotency_key,
    p_from_wallet: row.from_wallet,
    p_to_wallet: row.to_wallet,
    p_to_handle: row.to_handle,
    p_token: row.token,
    p_amount: row.amount,
    p_kind: row.kind,
    p_per_tx: perTx,
    p_daily: daily,
    p_pending_ttl_min: Math.round(PENDING_TTL_MS / 60_000),
  });

  if (error) {
    const missingFn = error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');
    if (!missingFn) return null;
    const limit = await checkLimits(row.from_wallet, row.token, row.amount);
    if (!limit.ok) return { ok: false, reason: limit.reason ?? 'limit_exceeded' };
    const rec = await recordPrepared(row);
    return rec ? { ok: true, id: rec.id, existing: rec.existing } : null;
  }

  const r = data as { ok?: boolean; id?: string; existing?: boolean; reason?: string } | null;
  if (!r) return null;
  if (r.ok) return r.id ? { ok: true, id: r.id, existing: !!r.existing } : null;
  return { ok: false, reason: r.reason ?? 'limit_exceeded' };
}

// Idempotent: a repeated idempotency_key returns the existing row instead of inserting a duplicate, so a
// double-tap / retry never records (or later confirms) the transfer twice.
export async function recordPrepared(row: {
  idempotency_key: string; from_wallet: string; to_wallet: string; to_handle: string | null;
  token: TransferToken; amount: number; kind: 'p2p' | 'self';
}): Promise<{ id: string; existing: boolean } | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('transfers').insert({ ...row, status: 'pending' }).select('id').single();
  if (!error && data) return { id: data.id, existing: false };
  if (error?.code === '23505') {
    const { data: ex } = await supabase.from('transfers').select('id').eq('idempotency_key', row.idempotency_key).maybeSingle();
    if (ex) return { id: ex.id, existing: true };
  }
  return null;
}

// Confirm an on-chain transfer. Verifies the tx succeeded AND actually moved the recorded amount from
// from_wallet to to_wallet (via the lamport balance deltas) — so a dust/unrelated tx can't mark a large
// row 'sent', and a recorded amount can't diverge from what really landed. A single signature confirms at
// most one row (replay guard). Leaves the row 'pending' (retryable) on any RPC/verification miss.
export async function confirmTransfer(args: { id: string; from_wallet: string; tx_hash: string }): Promise<{ ok: boolean; status: 'sent' | 'pending' }> {
  const supabase = createServiceClient();
  const { data: row } = await supabase.from('transfers').select('id, from_wallet, to_wallet, status, amount, token, kind').eq('id', args.id).maybeSingle();
  if (!row || row.from_wallet !== args.from_wallet) return { ok: false, status: 'pending' };
  if (row.status === 'sent') return { ok: true, status: 'sent' };

  // Devnet routinely takes longer to surface a transaction via getTransaction than the client's own
  // wait did — a single immediate lookup here was the other half of "devnet wasn't actually transferring
  // money": the on-chain send genuinely succeeded, but this one-shot check missed it (tx not yet visible
  // at 'confirmed' commitment) and left the row — and any payment_request waiting on it — 'pending'
  // forever, since nothing ever re-checked. Retry a handful of times with a short backoff before giving
  // up; a DEFINITIVE on-chain failure (meta.err set) breaks out immediately since retrying can't help.
  let verified = false;
  const conn = new Connection(rpcUrl(), 'confirmed');
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const tx = await conn.getTransaction(args.tx_hash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      const meta = tx?.meta;
      if (tx && meta && !meta.err && meta.preBalances && meta.postBalances) {
        const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map((k: PublicKey) => k.toBase58());
        const fromIdx = keys.indexOf(row.from_wallet);
        const toIdx = keys.indexOf(row.to_wallet);
        if (fromIdx >= 0 && toIdx >= 0) {
          if (row.token === 'SOL') {
            const received = (meta.postBalances[toIdx] ?? 0) - (meta.preBalances[toIdx] ?? 0);
            const fromDelta = (meta.postBalances[fromIdx] ?? 0) - (meta.preBalances[fromIdx] ?? 0);
            const expected = Math.round(Number(row.amount) * LAMPORTS_PER_SOL);
            // Recipient must have received at least the recorded amount, and the sender's balance must drop.
            verified = expected > 0 && received >= expected && fromDelta < 0;
          } else if (row.token === 'USDC') {
            // Verify the recipient's USDC token-account balance rose by >= the recorded amount.
            const expectedBase = Math.round(Number(row.amount) * 10 ** USDC_DECIMALS);
            const find = (arr: any[] | null | undefined) => (arr ?? []).find((b: any) => b.owner === row.to_wallet && b.mint === USDC_MINT);
            const pre = Number(find(meta.preTokenBalances)?.uiTokenAmount?.amount ?? 0);
            const post = Number(find(meta.postTokenBalances)?.uiTokenAmount?.amount ?? 0);
            verified = expectedBase > 0 && (post - pre) >= expectedBase;
          }
        }
        break; // tx found (verified either way) — no point retrying
      }
      if (tx && meta?.err) break; // definitive on-chain failure — retrying won't change that
    } catch { /* transient RPC hiccup — fall through to retry */ }
    if (attempt < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 1500));
  }

  if (!verified) {
    await supabase.from('transfers').update({ tx_hash: args.tx_hash }).eq('id', args.id);
    return { ok: false, status: 'pending' };
  }

  // One signature can confirm at most one row. Best-effort here; the partial-unique index in
  // migration_transfers_txhash.sql is the durable backstop against the read/write race.
  const { data: dup } = await supabase.from('transfers').select('id').eq('tx_hash', args.tx_hash).eq('status', 'sent').neq('id', row.id).limit(1).maybeSingle();
  if (dup) {
    await supabase.from('transfers').update({ tx_hash: args.tx_hash }).eq('id', args.id);
    return { ok: false, status: 'pending' };
  }

  await supabase.from('transfers').update({ status: 'sent', tx_hash: args.tx_hash, confirmed_at: new Date().toISOString() }).eq('id', args.id);

  // Notify the recipient that money landed (fire-and-forget; skip transfers between the user's own wallets).
  if (row.kind !== 'self' && row.to_wallet && row.to_wallet !== row.from_wallet) {
    const { data: sender } = await supabase.from('profiles').select('display_name').eq('wallet', row.from_wallet).maybeSingle();
    const who = sender?.display_name || `${row.from_wallet.slice(0, 4)}…${row.from_wallet.slice(-4)}`;
    void notify({
      recipient_wallet: row.to_wallet,
      type: 'transfer_received',
      title: `${who} sent you ${row.amount} ${row.token}`,
      link: '/wallet',
      data: { transfer_id: row.id, from_wallet: row.from_wallet, amount: row.amount, token: row.token },
    });
  }

  return { ok: true, status: 'sent' };
}
