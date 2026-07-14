'use client';

// Neutralized (passwordless overhaul, 12b round 3): the entry-gating password prompt AND the passkey
// nudge (POL5) are gone by Judah's decision — Privy verifies identity at login (email/SMS OTP, social,
// wallet); Face ID is opt-in app-lock via AppLock/Settings, never a login step. Password remains an
// OPTIONAL credential managed in Settings → Security only.
//
// Kept as a pass-through so any lingering import doesn't break the tree. It renders its children
// unchanged and gates nothing. Safe to delete once no import references it.
export function PasswordGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
