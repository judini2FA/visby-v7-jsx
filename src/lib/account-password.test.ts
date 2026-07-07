import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateResetToken,
  hashResetToken,
  resetTokenMatches,
  passwordProblem,
  PASSWORD_MIN,
  PASSWORD_MAX,
  RESET_TTL_MS,
} from '@/lib/account-password';

describe('account-password — hashPassword / verifyPassword roundtrip', () => {
  it('a correct password verifies true against its own hash', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('a wrong password verifies false', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password entirely', stored)).toBe(false);
  });

  it('stores in the scrypt$salt$hash format', async () => {
    const stored = await hashPassword('hunter22222');
    const parts = stored.split('$');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it('two hashes of the same password differ (random salt per hash)', async () => {
    const a = await hashPassword('same-password-123');
    const b = await hashPassword('same-password-123');
    expect(a).not.toBe(b);
    // but both still verify correctly
    expect(await verifyPassword('same-password-123', a)).toBe(true);
    expect(await verifyPassword('same-password-123', b)).toBe(true);
  });

  it('verifyPassword is false for a null/undefined/empty stored hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', undefined)).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('verifyPassword is false for a malformed stored hash', async () => {
    expect(await verifyPassword('anything', 'not-a-valid-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$onlyonefield')).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$aabbcc$ddeeff')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$$')).toBe(false);
  });

  it('verifyPassword is false when the stored hash length is wrong for the keylen', async () => {
    // valid-looking scrypt$..$.. shape but the hash portion is too short to be a real KEYLEN=64 digest
    expect(await verifyPassword('anything', 'scrypt$aabbcc$aabbcc')).toBe(false);
  });

  it('verifyPassword is false when the salt/hash hex is not actually valid hex-decodable garbage', async () => {
    expect(await verifyPassword('anything', 'scrypt$zzzz$zzzz')).toBe(false);
  });
});

describe('account-password — reset token generation and matching', () => {
  it('a freshly generated token matches its own hash', () => {
    const { token, tokenHash } = generateResetToken();
    expect(resetTokenMatches(token, tokenHash)).toBe(true);
  });

  it('a wrong token does not match', () => {
    const { tokenHash } = generateResetToken();
    const other = generateResetToken();
    expect(resetTokenMatches(other.token, tokenHash)).toBe(false);
  });

  it('generateResetToken produces unique tokens across calls', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it('hashResetToken is deterministic (pure sha256)', () => {
    const { token } = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
  });

  it('tokenHash from generateResetToken equals hashResetToken(token)', () => {
    const { token, tokenHash } = generateResetToken();
    expect(hashResetToken(token)).toBe(tokenHash);
  });

  it('resetTokenMatches is false for empty/null/undefined token or hash', () => {
    const { token, tokenHash } = generateResetToken();
    expect(resetTokenMatches('', tokenHash)).toBe(false);
    expect(resetTokenMatches(token, '')).toBe(false);
    expect(resetTokenMatches(token, null)).toBe(false);
    expect(resetTokenMatches(token, undefined)).toBe(false);
    expect(resetTokenMatches('', '')).toBe(false);
  });

  it('resetTokenMatches is false for a malformed (non-hex) stored hash', () => {
    const { token } = generateResetToken();
    expect(resetTokenMatches(token, 'not-hex-zzzz')).toBe(false);
  });

  it('RESET_TTL_MS is 30 minutes', () => {
    expect(RESET_TTL_MS).toBe(30 * 60 * 1000);
  });
});

describe('account-password — passwordProblem (re-exported password-rules)', () => {
  it('rejects a too-short password', () => {
    const problem = passwordProblem('a'.repeat(PASSWORD_MIN - 1));
    expect(problem).not.toBeNull();
    expect(typeof problem).toBe('string');
  });

  it('rejects a too-long password', () => {
    const problem = passwordProblem('Ax1' + 'b'.repeat(PASSWORD_MAX));
    expect(problem).not.toBeNull();
  });

  it('accepts a valid password (returns null)', () => {
    expect(passwordProblem('a valid password 123')).toBeNull();
  });

  it('rejects a non-string input', () => {
    expect(passwordProblem(undefined)).not.toBeNull();
    expect(passwordProblem(12345678)).not.toBeNull();
  });

  it('rejects a password that is all one repeated character', () => {
    expect(passwordProblem('aaaaaaaaaa')).not.toBeNull();
  });

  it('accepts a password exactly at PASSWORD_MIN length', () => {
    expect(passwordProblem('ab1defgh')).toBeNull();
    expect('ab1defgh'.length).toBe(PASSWORD_MIN);
  });

  it('accepts a password exactly at PASSWORD_MAX length', () => {
    const pw = 'Ax1' + 'b'.repeat(PASSWORD_MAX - 3);
    expect(pw.length).toBe(PASSWORD_MAX);
    expect(passwordProblem(pw)).toBeNull();
  });
});
