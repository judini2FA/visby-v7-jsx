// Client-SAFE password rules. Deliberately imports NOTHING from node:crypto so this module can be
// bundled into client components (the PasswordGate + Settings forms) without pulling a server-only
// module into the browser. The crypto (hash/verify/reset-token) lives in account-password.ts, which is
// server-only and re-exports these for route callers.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// Returns a human-facing reason if the password is too weak, else null. Deliberately lenient (length +
// not-all-one-character) — an intimidating strength meter fights the "toddler-proof" goal; the real
// account security is the Privy email factor + 2FA, this is an additional layer.
export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Enter a password.';
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Keep it under ${PASSWORD_MAX} characters.`;
  if (/^(.)\1+$/.test(pw)) return 'Too easy to guess — mix it up a little.';
  return null;
}
