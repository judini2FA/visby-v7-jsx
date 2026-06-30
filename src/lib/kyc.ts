import { createServiceClient } from '@/lib/supabase/service';

export type KycStatus = 'unverified' | 'pending' | 'approved' | 'declined' | 'review';
export type AccountType = 'personal' | 'business';

// Single rollout flag (same philosophy as step-up): selling is gated on approved KYC ONLY when this is
// set. Off = unchanged behavior (no gate), so enabling KYC is a deliberate switch rather than an instant
// block on every existing seller. Readable on both server and client (NEXT_PUBLIC_*).
export function kycRequired(): boolean {
  return process.env.NEXT_PUBLIC_KYC_REQUIRED === '1';
}

const FALLBACK = { kyc_status: 'unverified' as KycStatus, account_type: 'personal' as AccountType, kyc_verified_at: null as string | null };

export async function getKycStatus(wallet: string): Promise<{ kyc_status: KycStatus; account_type: AccountType; kyc_verified_at: string | null }> {
  if (!wallet) return { ...FALLBACK };
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('profiles')
      .select('kyc_status, account_type, kyc_verified_at')
      .eq('wallet', wallet)
      .maybeSingle();
    if (!data) return { ...FALLBACK };
    return {
      kyc_status: (data.kyc_status ?? 'unverified') as KycStatus,
      account_type: (data.account_type ?? 'personal') as AccountType,
      kyc_verified_at: data.kyc_verified_at ?? null,
    };
  } catch {
    return { ...FALLBACK };
  }
}

// Gate for minting / listing / relisting. Dormant (always ok) until kycRequired(). When required, only an
// approved wallet may sell; anything else — including an unreadable status — is blocked (fail-closed).
export async function requireKycForSale(wallet: string): Promise<{ ok: boolean; status: KycStatus }> {
  if (!kycRequired()) return { ok: true, status: 'approved' };
  const { kyc_status } = await getKycStatus(wallet);
  return { ok: kyc_status === 'approved', status: kyc_status };
}

// Same gate, but KYC is a property of the PERSON, not a single wallet: verifying once on any of the user's
// linked wallets unlocks selling from all of them. Callers pass the authed user's full wallet list
// (ctx.wallets). Approved if ANY wallet is approved; otherwise surfaces the most-progressed status (an
// in-flight pending/review beats unverified) for a helpful message. Fail-closed on an unreadable status.
export async function requireKycForSaleAny(wallets: string[]): Promise<{ ok: boolean; status: KycStatus }> {
  if (!kycRequired()) return { ok: true, status: 'approved' };
  const list = Array.from(new Set((wallets ?? []).filter(Boolean)));
  if (list.length === 0) return { ok: false, status: 'unverified' };
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('profiles').select('kyc_status').in('wallet', list);
    const statuses = (data ?? []).map((r: any) => (r.kyc_status ?? 'unverified') as KycStatus);
    if (statuses.includes('approved')) return { ok: true, status: 'approved' };
    const rank: KycStatus[] = ['review', 'pending', 'declined', 'unverified'];
    return { ok: false, status: rank.find(s => statuses.includes(s)) ?? 'unverified' };
  } catch {
    return { ok: false, status: 'unverified' };
  }
}

// User-level status for the badge + "verify to sell" prompt — mirrors the per-user gate so the UI never
// shows "unverified" on a wallet when the person verified on a sibling wallet. Prefers an approved profile,
// else the most-progressed one.
export async function getKycStatusForUser(wallets: string[]): Promise<{ kyc_status: KycStatus; account_type: AccountType; kyc_verified_at: string | null }> {
  const list = Array.from(new Set((wallets ?? []).filter(Boolean)));
  if (list.length === 0) return { ...FALLBACK };
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('profiles').select('kyc_status, account_type, kyc_verified_at').in('wallet', list);
    const rows = (data ?? []) as Array<{ kyc_status?: KycStatus; account_type?: AccountType; kyc_verified_at?: string | null }>;
    if (rows.length === 0) return { ...FALLBACK };
    const byStatus = (s: KycStatus) => rows.find(r => r.kyc_status === s);
    const pick = byStatus('approved') ?? byStatus('review') ?? byStatus('pending') ?? byStatus('declined') ?? rows[0];
    return {
      kyc_status: (pick.kyc_status ?? 'unverified') as KycStatus,
      account_type: (pick.account_type ?? 'personal') as AccountType,
      kyc_verified_at: pick.kyc_verified_at ?? null,
    };
  } catch {
    return { ...FALLBACK };
  }
}

// Source of truth for the gate's denormalized flag on profiles. Webhook + admin override both call this.
// Best-effort (kyc_verifications holds the durable per-inquiry record); never throws into the caller.
export async function setKycStatus(wallet: string, status: KycStatus, opts?: { account_type?: AccountType }): Promise<void> {
  if (!wallet) return;
  try {
    const supabase = createServiceClient();
    const patch: Record<string, unknown> = { kyc_status: status };
    if (status === 'approved') patch.kyc_verified_at = new Date().toISOString();
    if (opts?.account_type) patch.account_type = opts.account_type;
    await supabase.from('profiles').update(patch).eq('wallet', wallet);
  } catch { /* durable record lives in kyc_verifications */ }
}
