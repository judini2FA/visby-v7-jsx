import { createServiceClient } from '@/lib/supabase/service';

// Account moderation status (see migration_account_status.sql). Single source of truth for the
// enforcement path so "suspended"/"banned" mean the same thing everywhere.
export type AccountStatus = 'active' | 'suspended' | 'banned';

// Reads the WORST status across a user's linked wallets (a ban on any linked wallet bans the user).
// Fail-OPEN: any DB error returns 'active' so a transient outage can never lock out legitimate users —
// a durable suspension/ban is simply re-read on the next request. Mirrors the existing is_flagged posture.
// Also honors the legacy is_flagged boolean (treated as 'suspended') so pre-migration flags still bite.
export async function getWorstStatus(wallets: string[]): Promise<AccountStatus> {
  const list = Array.from(new Set((wallets ?? []).filter(Boolean)));
  if (!list.length) return 'active';
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('account_status, is_flagged')
      .in('wallet', list);
    if (error) {
      console.error('[account-status] read failed (fail-open):', error.message);
      return 'active';
    }
    let worst: AccountStatus = 'active';
    for (const r of data ?? []) {
      const s = (r as any).account_status as string | null;
      // A CCPA/GDPR-deleted account is enforced as banned (fully locked out) — no separate gate needed.
      if (s === 'banned' || s === 'deleted') return 'banned';
      if (s === 'suspended' || (r as any).is_flagged === true) worst = 'suspended';
    }
    return worst;
  } catch (e) {
    console.error('[account-status] read threw (fail-open):', e);
    return 'active';
  }
}

// Banned = fully locked out (every authenticated action rejected).
export async function isBanned(wallets: string[]): Promise<boolean> {
  return (await getWorstStatus(wallets)) === 'banned';
}

// Suspended OR banned = cannot sell / mint / list or do sensitive writes.
export async function isRestricted(wallets: string[]): Promise<boolean> {
  return (await getWorstStatus(wallets)) !== 'active';
}
