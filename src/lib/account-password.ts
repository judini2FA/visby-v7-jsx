import { scrypt as _scrypt, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';

// Visby account password (the account-level credential layered over Privy email login — NOT the wallet;
// the embedded wallet is still keyless MPC and never exposes a seed phrase). Hashing is scrypt via Node's
// crypto (no new dependency). Stored as `scrypt$<saltHex>$<hashHex>`; verification is constant-time.
//
// Threat model: a leaked account_security row must not yield the password. scrypt is memory-hard, the salt
// is per-user random, and comparison is timing-safe. Reset tokens are emailed in the clear but only their
// SHA-256 is stored, so the table alone can't be used to reset anyone.

const scrypt = promisify(_scrypt);
const KEYLEN = 64;
const SALT_BYTES = 16;

// The pure validation rules live in a client-safe module (no node:crypto), so client components import
// them from there directly. Re-exported here so server routes can keep importing from account-password.
export { PASSWORD_MIN, PASSWORD_MAX, passwordProblem } from './password-rules';

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(pw, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (expected.length !== KEYLEN) return false;
    const derived = (await scrypt(pw, salt, KEYLEN)) as Buffer;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ── Email-based reset (used by the "forgot password" flow) ──────────────────────────────────────────
// The raw token is emailed to the user's Privy-verified address; only its hash is persisted.
export const RESET_TTL_MS = 30 * 60 * 1000;

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Constant-time comparison of a presented reset token against the stored hash.
export function resetTokenMatches(token: string, storedHash: string | null | undefined): boolean {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashResetToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
