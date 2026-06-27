import { createServiceClient } from '@/lib/supabase/service';

// Admin/moderator wallets. NEXT_PUBLIC_ADMIN_WALLETS (comma-separated Solana addresses) is the
// BOOTSTRAP super-admin set — public-by-design (wallets aren't secrets) so the client can gate admin UI,
// with real enforcement server-side. Beyond bootstrap, the admin roster lives in the admin_users table
// (migration_admin_users.sql) and is managed at runtime by super-admins.
const ADMIN_WALLETS = (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export type AdminRole = 'super_admin' | 'finance' | 'moderator' | 'authenticator';
export const ADMIN_ROLES: AdminRole[] = ['super_admin', 'finance', 'moderator', 'authenticator'];

// Sync, env-only — for CLIENT-side admin-UI gating and as the bootstrap super-admin fallback. Real
// authorization on the server uses isAdminRole/getAdminRole (DB-backed).
export function isAdminWallet(wallet?: string | null): boolean {
  return !!wallet && ADMIN_WALLETS.includes(wallet);
}

// Server-side: the wallet's admin role, or null. Env-bootstrap wallets are always super_admin (can never
// be locked out / can manage the team). Falls back to "env only" if the table isn't migrated yet.
export async function getAdminRole(wallet?: string | null): Promise<AdminRole | null> {
  if (!wallet) return null;
  if (isAdminWallet(wallet)) return 'super_admin';
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('admin_users')
      .select('role')
      .eq('wallet', wallet)
      .maybeSingle();
    if (error || !data) return null;
    return (data.role ?? null) as AdminRole | null;
  } catch {
    return null;
  }
}

// True if the wallet is an admin (optionally of a specific role). super_admin satisfies any required role.
export async function isAdminRole(wallet: string | null | undefined, required?: AdminRole): Promise<boolean> {
  const role = await getAdminRole(wallet);
  if (!role) return false;
  if (!required) return true;
  if (role === 'super_admin') return true;
  return role === required;
}

export type AdminUser = { wallet: string; role: AdminRole; granted_by: string | null; granted_at: string; bootstrap?: boolean };

export async function listAdmins(): Promise<AdminUser[]> {
  const bootstrap: AdminUser[] = ADMIN_WALLETS.map(w => ({ wallet: w, role: 'super_admin' as AdminRole, granted_by: null, granted_at: '', bootstrap: true }));
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('admin_users').select('*').order('granted_at', { ascending: true });
    const db = (data ?? []).filter((r: any) => !ADMIN_WALLETS.includes(r.wallet)) as AdminUser[];
    return [...bootstrap, ...db];
  } catch {
    return bootstrap;
  }
}

export async function grantAdmin(wallet: string, role: AdminRole, grantedBy: string): Promise<{ ok: boolean; error?: string }> {
  if (!wallet || !ADMIN_ROLES.includes(role)) return { ok: false, error: 'Invalid wallet or role' };
  if (isAdminWallet(wallet)) return { ok: false, error: 'That wallet is a bootstrap super-admin (managed via env)' };
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('admin_users').upsert({ wallet, role, granted_by: grantedBy, granted_at: new Date().toISOString() }, { onConflict: 'wallet' });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Failed' };
  }
}

export async function revokeAdmin(wallet: string): Promise<{ ok: boolean; error?: string }> {
  if (!wallet) return { ok: false, error: 'No wallet' };
  if (isAdminWallet(wallet)) return { ok: false, error: 'Cannot revoke a bootstrap super-admin (managed via env)' };
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('admin_users').delete().eq('wallet', wallet);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Failed' };
  }
}
