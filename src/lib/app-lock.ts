const LS_ENABLED = 'visby-app-lock';
const LS_CRED = 'visby-app-lock-cred';
const SS_UNLOCKED = 'visby-app-unlocked';

function b64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function webauthnSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext;
}

export function isAppLockEnabled(): boolean {
  try {
    return localStorage.getItem(LS_ENABLED) === '1';
  } catch {
    return false;
  }
}

// Fail-open: a storage error must never lock the user out.
export function isUnlockedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SS_UNLOCKED) === '1';
  } catch {
    return true;
  }
}

export function markLocked(): void {
  try {
    sessionStorage.removeItem(SS_UNLOCKED);
  } catch {}
}

export function markUnlocked(): void {
  try {
    sessionStorage.setItem(SS_UNLOCKED, '1');
  } catch {}
}

export async function enableAppLock(label: string): Promise<{ ok: boolean; reason?: string }> {
  if (!webauthnSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Visby', id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: label || 'visby',
          displayName: label || 'Visby',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, reason: 'cancelled' };
    localStorage.setItem(LS_CRED, b64urlEncode(cred.rawId));
    localStorage.setItem(LS_ENABLED, '1');
    markUnlocked();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.name || 'failed' };
  }
}

export function disableAppLock(): void {
  try {
    localStorage.removeItem(LS_ENABLED);
    localStorage.removeItem(LS_CRED);
    sessionStorage.removeItem(SS_UNLOCKED);
  } catch {}
}

export async function unlockAppLock(): Promise<boolean> {
  // Fail-open: never brick a device that can't do WebAuthn.
  if (!webauthnSupported()) {
    markUnlocked();
    return true;
  }
  let credId: string | null = null;
  try {
    credId = localStorage.getItem(LS_CRED);
  } catch {
    credId = null;
  }
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: credId
          ? [{ type: 'public-key', id: b64urlDecode(credId) }]
          : [],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    markUnlocked();
    return true;
  } catch {
    return false;
  }
}

// One-off biometric/passkey check for a sensitive action ("scan your face to send"). Reuses the app-lock
// platform credential when the user has set one up (App Lock in Settings) — then a cancel BLOCKS the
// action. When no credential exists there's nothing to scan, so it FAILS OPEN (returns true) rather than
// blocking a user who never enrolled biometrics. WebAuthn-unsupported also passes.
export async function biometricConfirm(): Promise<boolean> {
  if (!webauthnSupported()) return true;
  let credId: string | null = null;
  try { credId = localStorage.getItem(LS_CRED); } catch { credId = null; }
  if (!credId) return true;
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: b64urlDecode(credId) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return true;
  } catch {
    return false;
  }
}

// Whether a face/fingerprint credential is set up — lets the UI label the action "Scan to send" only when
// the scan will actually happen.
export function biometricAvailable(): boolean {
  if (!webauthnSupported()) return false;
  try { return !!localStorage.getItem(LS_CRED); } catch { return false; }
}
