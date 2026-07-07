import { describe, it, expect } from 'vitest';
import { isAdminWallet, ADMIN_ROLES } from '@/lib/admin';

// Blueprint 11.4 — the sync, env-only admin-wallet guard. ADMIN_WALLETS is read from
// NEXT_PUBLIC_ADMIN_WALLETS at module load; in the test process that env is unset, so the bootstrap set
// is EMPTY. The guard must therefore reject every wallet — and must never throw on null/undefined/empty.
// (The DB-backed getAdminRole/isAdminRole are NOT tested here: they hit Supabase.)

describe('admin — isAdminWallet fails closed with no bootstrap env', () => {
  it('rejects a null / undefined / empty wallet without throwing', () => {
    expect(isAdminWallet(null)).toBe(false);
    expect(isAdminWallet(undefined)).toBe(false);
    expect(isAdminWallet('')).toBe(false);
    expect(isAdminWallet()).toBe(false);
  });

  it('rejects any arbitrary wallet when the bootstrap set is empty', () => {
    expect(isAdminWallet('So11111111111111111111111111111111111111112')).toBe(false);
    expect(isAdminWallet('not-a-real-wallet')).toBe(false);
    expect(isAdminWallet('   ')).toBe(false);
  });
});

describe('admin — ADMIN_ROLES is the closed role set', () => {
  it('contains exactly the four known roles with no duplicates', () => {
    expect([...ADMIN_ROLES].sort()).toEqual(
      ['authenticator', 'finance', 'moderator', 'super_admin'].sort(),
    );
    expect(new Set(ADMIN_ROLES).size).toBe(ADMIN_ROLES.length);
  });
});
