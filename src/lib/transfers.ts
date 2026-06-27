import { Connection, PublicKey } from '@solana/web3.js';
import { createServiceClient } from '@/lib/supabase/service';

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

  const safe = q.slice(0, 60).replace(/[%,()*\\]/g, ' ').trim();
  if (!safe) return null;
  const { data } = await supabase
    .from('profiles')
    .select('wallet, display_name, avatar_url')
    .ilike('display_name', safe)
    .limit(1)
    .maybeSingle();
  if (!data?.wallet || !isSolAddr(data.wallet)) return null;
  return { wallet: data.wallet, handle: q, display_name: data.display_name ?? null, avatar_url: data.avatar_url ?? null };
}

// Sum of today's (UTC) outgoing amounts for a wallet in one token — pending + sent both count so a burst
// of prepares can't slip past the daily cap before any confirms.
async function dailyUsed(fromWallet: string, token: TransferToken): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('transfers')
    .select('amount')
    .eq('from_wallet', fromWallet)
    .eq('token', token)
    .in('status', ['pending', 'sent'])
    .gte('created_at', since.toISOString());
  return (data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
}

export async function checkLimits(fromWallet: string, token: TransferToken, amount: number): Promise<{ ok: boolean; reason?: string }> {
  const { perTx, daily } = limitsFor(token);
  if (!(amount > 0)) return { ok: false, reason: 'invalid_amount' };
  if (amount > perTx) return { ok: false, reason: `per_tx_limit:${perTx}` };
  const used = await dailyUsed(fromWallet, token);
  if (used + amount > daily) return { ok: false, reason: `daily_limit:${daily}` };
  return { ok: true };
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

// Confirm an on-chain transfer. Light verification: the tx exists, succeeded, and both wallets are among
// its accounts — enough to stop a bogus tx_hash from being written into history without a heavy full parse.
export async function confirmTransfer(args: { id: string; from_wallet: string; tx_hash: string }): Promise<{ ok: boolean; status: 'sent' | 'pending' }> {
  const supabase = createServiceClient();
  const { data: row } = await supabase.from('transfers').select('id, from_wallet, to_wallet, status').eq('id', args.id).maybeSingle();
  if (!row || row.from_wallet !== args.from_wallet) return { ok: false, status: 'pending' };
  if (row.status === 'sent') return { ok: true, status: 'sent' };

  let verified = false;
  try {
    const conn = new Connection(rpcUrl(), 'confirmed');
    const tx = await conn.getTransaction(args.tx_hash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (tx && !tx.meta?.err) {
      const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map((k: PublicKey) => k.toBase58());
      verified = keys.includes(row.from_wallet) && keys.includes(row.to_wallet);
    }
  } catch { /* RPC hiccup — leave pending, the client can retry confirm */ }

  if (!verified) {
    await supabase.from('transfers').update({ tx_hash: args.tx_hash }).eq('id', args.id);
    return { ok: false, status: 'pending' };
  }
  await supabase.from('transfers').update({ status: 'sent', tx_hash: args.tx_hash, confirmed_at: new Date().toISOString() }).eq('id', args.id);
  return { ok: true, status: 'sent' };
}
