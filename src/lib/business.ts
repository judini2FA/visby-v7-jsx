import { createServiceClient } from '@/lib/supabase/service';

// The ONLY place profiles.account_type flips to/from 'business'. Business status strictly follows a
// business_verifications outcome (auto-verified via KYB or attestation, or an admin override) — never a
// personal KYC check. Demotion also clears self_ship so a demoted account can't keep self-shipping.
// Best-effort like setKycStatus; returns ok=false if the profile write fails so callers can surface it.
export async function setBusinessAccount(wallet: string, on: boolean): Promise<{ ok: boolean }> {
  if (!wallet) return { ok: false };
  try {
    const supabase = createServiceClient();
    const patch: Record<string, unknown> = { account_type: on ? 'business' : 'personal' };
    if (!on) patch.self_ship = false;
    const { error } = await supabase.from('profiles').update(patch).eq('wallet', wallet);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
