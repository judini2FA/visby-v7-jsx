import crypto from 'crypto';

// App-level envelope encryption for sensitive read-credentials stored in Postgres (Plaid access_token,
// SnapTrade user_secret). AES-256-GCM with a key from SECRET_ENCRYPTION_KEY (32-byte, hex or base64).
//
// Transition-safe by design:
//  - No key configured → encryptSecret returns plaintext (sandbox keeps working); decryptSecret passes
//    plaintext through. Set the key and new writes become ciphertext.
//  - Mixed rows are fine: decryptSecret detects the `enc:v1:` prefix and only decrypts tagged values, so
//    legacy plaintext rows still read correctly after the key is added.

const PREFIX = 'enc:v1:';

function loadKey(): Buffer | null {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  if (!key) return plaintext; // not configured — store as-is (sandbox); encrypt once the key is set
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext value
  const key = loadKey();
  if (!key) throw new Error('SECRET_ENCRYPTION_KEY is required to read an encrypted credential');
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
