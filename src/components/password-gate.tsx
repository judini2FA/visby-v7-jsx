'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { passwordProblem } from '@/lib/password-rules';
import { webauthnSupported } from '@/lib/app-lock';
import { t, S, btn, input, card, T } from '@/lib/ui';

// Session flag is per-wallet so switching accounts on the same device re-gates. Cleared on Privy
// logout (see effect below) so the next sign-in — same wallet or not — always re-prompts.
//
// Stores a timestamp (not a bare flag) in localStorage — not sessionStorage — so the unlock survives
// a tab/browser close and re-prompts purely on elapsed time (S3): a signed-in user stays past the
// gate for ~1 hour of real time, then the next visit (any tab) re-checks and re-prompts.
const SESSION_TTL_MS = 60 * 60 * 1000; // ~1 hour

function sessionKey(wallet: string) {
  return `visby-pw-ok:${wallet}`;
}

function isSessionOk(wallet: string): boolean {
  try {
    const raw = localStorage.getItem(sessionKey(wallet));
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < SESSION_TTL_MS;
  } catch {
    return false;
  }
}

function markSessionOk(wallet: string): void {
  try {
    localStorage.setItem(sessionKey(wallet), String(Date.now()));
  } catch {}
}

function clearSessionOk(wallet: string): void {
  try {
    localStorage.removeItem(sessionKey(wallet));
  } catch {}
}

type GateStatus = 'checking' | 'needs-create' | 'needs-verify' | 'clear';

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, getAccessToken, logout, user } = usePrivy();
  const { address: wallet, ready: walletReady } = useVisbWallet();

  // The email Privy already verified for this session — shown on the gate so signing in reads as a
  // proper "email + password" login, not a bare password prompt.
  const email = user?.email?.address ?? (typeof user?.google?.email === 'string' ? user.google.email : null) ?? null;

  const [status, setStatus] = useState<GateStatus>('checking');
  const loadedForWallet = useRef<string | null>(null);
  // Bumped by the TTL-expiry watcher below to force the main effect to re-run its isSessionOk check
  // even though ready/authenticated/wallet haven't changed.
  const [recheckTick, setRecheckTick] = useState(0);

  // Privy logout must always invalidate the session flag — otherwise a second person signing into
  // the same device/browser would inherit the previous user's unlocked gate.
  const prevAuthed = useRef(authenticated);
  useEffect(() => {
    if (prevAuthed.current && !authenticated && wallet) clearSessionOk(wallet);
    prevAuthed.current = authenticated;
  }, [authenticated, wallet]);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }, [getAccessToken]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    if (!walletReady || !wallet) return;

    if (isSessionOk(wallet)) {
      setStatus('clear');
      loadedForWallet.current = wallet;
      return;
    }

    if (loadedForWallet.current === wallet) return; // already fetched security status this mount
    loadedForWallet.current = wallet;
    setStatus('checking');

    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/account/security?wallet=${encodeURIComponent(wallet)}`, { headers });
        if (!res.ok) {
          // Fail closed on verify (never skip the gate silently) but don't strand the user —
          // treat as "needs-verify" so Forgot-password / Sign-out escapes are always reachable.
          setStatus('needs-verify');
          return;
        }
        const j = await res.json();
        setStatus(j.hasPassword ? 'needs-verify' : 'needs-create');
      } catch {
        setStatus('needs-verify');
      }
    })();
  }, [ready, authenticated, walletReady, wallet, authHeaders, recheckTick]);

  // Re-prompt once the ~1hr session lapses even if the tab was left open the whole time (S3) —
  // isSessionOk is otherwise only consulted on mount/wallet-change. Checked on an interval and on
  // tab refocus rather than a single long-lived timeout, so a laptop put to sleep mid-session still
  // re-locks promptly on wake instead of drifting past the TTL. Bumping recheckTick re-runs the main
  // effect above, which re-reads isSessionOk and re-locks if it has lapsed.
  useEffect(() => {
    if (status !== 'clear' || !wallet) return;
    function recheck() {
      if (wallet && !isSessionOk(wallet)) {
        loadedForWallet.current = null; // let the main effect's fetch-guard re-fire for this wallet
        setRecheckTick(n => n + 1);
      }
    }
    const id = setInterval(recheck, 60 * 1000);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [status, wallet]);

  function handleUnlocked() {
    if (wallet) markSessionOk(wallet);
    setStatus('clear');
  }

  function handleSignOut() {
    if (wallet) clearSessionOk(wallet);
    logout();
  }

  // Not ready yet: match AppLock's fail-open-on-loading approach — don't flash a gate before we
  // even know if the user is authenticated.
  if (!ready) return <>{children}</>;

  // Unauthenticated pages (including /login) gate themselves — never block them here.
  if (!authenticated) return <>{children}</>;

  // Privy is authenticated but the Solana wallet hasn't materialized yet (EnsureSolanaWallet is
  // still creating it) — render children; there's nothing to gate against yet.
  if (!walletReady || !wallet) return <>{children}</>;

  if (status === 'clear') return <>{children}</>;

  return (
    <>
      {children}
      <GateOverlay
        status={status}
        wallet={wallet}
        email={email}
        authHeaders={authHeaders}
        onUnlocked={handleUnlocked}
        onSignOut={handleSignOut}
      />
    </>
  );
}

const LockIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// The account's email, shown read-only above the password field so the gate reads as an "email +
// password" login (Privy already verified the email for this session, so it isn't re-entered).
function EmailField({ email }: { email: string | null }) {
  if (!email) return null;
  return (
    <input
      type="email"
      value={email}
      readOnly
      aria-label="Email"
      autoComplete="username"
      tabIndex={-1}
      style={{ ...input(), width: '100%', color: 'var(--text-muted)', cursor: 'default' }}
    />
  );
}

function GateOverlay({
  status,
  wallet,
  email,
  authHeaders,
  onUnlocked,
  onSignOut,
}: {
  status: GateStatus;
  wallet: string;
  email: string | null;
  authHeaders: () => Promise<Record<string, string>>;
  onUnlocked: () => void;
  onSignOut: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483600,
        background: 'var(--bg-0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: S[5],
      }}
    >
      <div style={{ ...card(), width: '100%', maxWidth: 400, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <LockIcon />
        {status === 'checking' && (
          <div style={{ ...t('body'), color: T.textMuted, marginTop: S[4] }}>Loading…</div>
        )}
        {status === 'needs-create' && (
          <CreatePasswordForm wallet={wallet} email={email} authHeaders={authHeaders} onDone={onUnlocked} onSignOut={onSignOut} />
        )}
        {status === 'needs-verify' && (
          <EnterPasswordForm wallet={wallet} email={email} authHeaders={authHeaders} onDone={onUnlocked} onSignOut={onSignOut} />
        )}
      </div>
    </div>
  );
}

const PasskeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M10.5 12H8a2 2 0 0 0-2 2v1" />
    <path d="M15 15l3 3 4-4" />
  </svg>
);

function CreatePasswordForm({
  wallet,
  email,
  authHeaders,
  onDone,
  onSignOut,
}: {
  wallet: string;
  email: string | null;
  authHeaders: () => Promise<Record<string, string>>;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const { linkPasskey, user } = usePrivy();
  // Default nudge (POL5): lead with "use a passkey instead" — the password form only shows once the
  // user explicitly opts out. Settings' own passkey control (security-settings.tsx) is untouched;
  // this just offers the same Privy linkPasskey() primitive earlier, at the moment it matters most.
  const [showPasswordForm, setShowPasswordForm] = useState(!webauthnSupported());
  const [pkBusy, setPkBusy] = useState(false);
  const [pkErr, setPkErr] = useState('');

  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // linkPasskey() is fire-and-forget (returns void, not a Promise) — Privy raises its own modal and
  // updates `user.linkedAccounts` asynchronously once the device actually completes WebAuthn. So
  // completion is detected by watching the passkey count rise, exactly like Settings' passkeyCount
  // badge does — never by awaiting the call itself, which would unlock instantly on click regardless
  // of whether the user finished (or cancelled) the on-device prompt.
  const passkeyCount = ((user?.linkedAccounts ?? []) as any[]).filter((a) => a.type === 'passkey').length;
  const passkeyCountAtOpen = useRef(passkeyCount);
  useEffect(() => {
    if (pkBusy && passkeyCount > passkeyCountAtOpen.current) {
      setPkBusy(false);
      onDone();
    }
  }, [passkeyCount, pkBusy, onDone]);

  // Privy's own modal has no cancel/error callback exposed here — if the user dismisses the
  // on-device prompt, nothing ever fires. This timeout is the only way to un-stick the button so
  // "Waiting for device…" doesn't spin forever; it's a no-op if the effect above already resolved it.
  useEffect(() => {
    if (!pkBusy) return;
    const id = setTimeout(() => setPkBusy(false), 45000);
    return () => clearTimeout(id);
  }, [pkBusy]);

  function usePasskey() {
    setPkErr('');
    passkeyCountAtOpen.current = passkeyCount;
    setPkBusy(true);
    try {
      linkPasskey?.();
    } catch {
      setPkBusy(false);
      setPkErr('Couldn’t set up a passkey on this device — try a password instead.');
    }
  }

  async function submit() {
    setErr('');
    const problem = passwordProblem(newPw);
    if (problem) { setErr(problem); return; }
    if (newPw !== confirmPw) { setErr('Passwords don’t match.'); return; }

    setBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/account/password/set', {
        method: 'POST',
        headers,
        body: JSON.stringify({ wallet, new_password: newPw }),
      });
      if (res.status === 429) { setErr('Too many tries — wait a moment and try again.'); return; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || 'Couldn’t save your password — try again.'); return; }
      onDone();
    } catch {
      setErr('Couldn’t save your password — try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!showPasswordForm) {
    return (
      <>
        <div style={{ ...t('title'), color: T.textStrong, marginTop: S[4] }}>Secure your account</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], marginBottom: S[5] }}>
          Use Face ID, Touch ID, or your device passkey instead of typing a password.
        </div>
        {email && <div style={{ width: '100%', marginBottom: S[2] }}><EmailField email={email} /></div>}
        {pkErr && <div style={{ ...t('meta'), color: 'var(--danger)', marginBottom: S[3] }}>{pkErr}</div>}
        <button
          onClick={usePasskey}
          disabled={pkBusy}
          style={{ ...btn('primary', { full: true }), opacity: pkBusy ? 0.7 : 1 }}
        >
          <PasskeyIcon />
          {pkBusy ? 'Waiting for device…' : 'Use a passkey'}
        </button>
        <button onClick={() => setShowPasswordForm(true)} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[4] }}>
          Use a password instead
        </button>
        <button onClick={onSignOut} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[2] }}>
          Sign out instead
        </button>
      </>
    );
  }

  return (
    <>
      <div style={{ ...t('title'), color: T.textStrong, marginTop: S[4] }}>Set your password</div>
      <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], marginBottom: S[5] }}>
        You'll sign in with your email and this password from now on.
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <EmailField email={email} />
        <input
          type="password"
          placeholder="New password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          style={input()}
          autoComplete="new-password"
          autoFocus
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          style={input()}
          autoComplete="new-password"
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
      </div>
      {err && <div style={{ ...t('meta'), color: 'var(--danger)', marginTop: S[3] }}>{err}</div>}
      <button
        onClick={submit}
        disabled={busy || !newPw || !confirmPw}
        style={{ ...btn('primary', { full: true }), marginTop: S[4], opacity: busy ? 0.7 : 1 }}
      >
        {busy ? 'Saving…' : 'Create password'}
      </button>
      {webauthnSupported() && (
        <button onClick={() => setShowPasswordForm(false)} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[3] }}>
          Use a passkey instead
        </button>
      )}
      <button onClick={onSignOut} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[2] }}>
        Sign out instead
      </button>
    </>
  );
}

type VerifyStep = 'enter' | 'forgot-request' | 'forgot-confirm';

function EnterPasswordForm({
  wallet,
  email,
  authHeaders,
  onDone,
  onSignOut,
}: {
  wallet: string;
  email: string | null;
  authHeaders: () => Promise<Record<string, string>>;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [step, setStep] = useState<VerifyStep>('enter');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [resetCode, setResetCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  async function submitVerify() {
    setErr('');
    if (!password) { setErr('Enter your password.'); return; }
    setBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/account/password/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ wallet, password }),
      });
      if (res.status === 429) { setErr('Too many tries — wait a moment and try again.'); return; }
      const j = await res.json().catch(() => ({ ok: false }));
      if (j.ok) { onDone(); return; }
      setErr('Incorrect password.');
    } catch {
      setErr('Couldn’t verify your password — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function requestReset() {
    setErr(''); setMsg('');
    setBusy(true);
    try {
      const headers = await authHeaders();
      await fetch('/api/account/password/reset/request', {
        method: 'POST',
        headers,
        body: JSON.stringify({ wallet }),
      });
      setStep('forgot-confirm');
      setMsg('We emailed you a code. Enter it below with a new password.');
    } catch {
      setErr('Couldn’t send a reset code — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitResetConfirm() {
    setErr(''); setMsg('');
    const problem = passwordProblem(newPw);
    if (problem) { setErr(problem); return; }
    if (newPw !== confirmPw) { setErr('Passwords don’t match.'); return; }
    setBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/account/password/reset/confirm', {
        method: 'POST',
        headers,
        body: JSON.stringify({ wallet, token: resetCode, new_password: newPw }),
      });
      if (res.status === 429) { setErr('Too many tries — wait a moment and try again.'); return; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error === 'bad_or_expired_token' ? 'That code is invalid or expired.' : (j.error || 'Couldn’t reset your password — try again.'));
        return;
      }
      onDone();
    } catch {
      setErr('Couldn’t reset your password — try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'enter') {
    return (
      <>
        <div style={{ ...t('title'), color: T.textStrong, marginTop: S[4] }}>Welcome back</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], marginBottom: S[5] }}>
          Sign in with your email and password.
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <EmailField email={email} />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...input(), width: '100%' }}
            autoComplete="current-password"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') submitVerify(); }}
          />
        </div>
        {err && <div style={{ ...t('meta'), color: 'var(--danger)', marginTop: S[3] }}>{err}</div>}
        <button
          onClick={submitVerify}
          disabled={busy || !password}
          style={{ ...btn('primary', { full: true }), marginTop: S[4], opacity: busy ? 0.7 : 1 }}
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <button onClick={requestReset} disabled={busy} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[4] }}>
          Forgot password?
        </button>
        <button onClick={onSignOut} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[2] }}>
          Sign out instead
        </button>
      </>
    );
  }

  return (
    <>
      <div style={{ ...t('title'), color: T.textStrong, marginTop: S[4] }}>Reset your password</div>
      <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2], marginBottom: S[5] }}>
        {msg || 'Enter the code we emailed you and choose a new password.'}
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <input
          type="text"
          placeholder="Emailed code"
          value={resetCode}
          onChange={(e) => setResetCode(e.target.value)}
          style={input()}
          autoComplete="one-time-code"
          autoFocus
        />
        <input
          type="password"
          placeholder="New password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          style={input()}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          style={input()}
          autoComplete="new-password"
          onKeyDown={(e) => { if (e.key === 'Enter') submitResetConfirm(); }}
        />
      </div>
      {err && <div style={{ ...t('meta'), color: 'var(--danger)', marginTop: S[3] }}>{err}</div>}
      <button
        onClick={submitResetConfirm}
        disabled={busy || !resetCode || !newPw || !confirmPw}
        style={{ ...btn('primary', { full: true }), marginTop: S[4], opacity: busy ? 0.7 : 1 }}
      >
        {busy ? 'Resetting…' : 'Reset password'}
      </button>
      <button onClick={requestReset} disabled={busy} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[4] }}>
        Resend code
      </button>
      <button onClick={() => { setStep('enter'); setErr(''); setMsg(''); }} disabled={busy} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[2] }}>
        Back
      </button>
      <button onClick={onSignOut} style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[2] }}>
        Sign out instead
      </button>
    </>
  );
}
