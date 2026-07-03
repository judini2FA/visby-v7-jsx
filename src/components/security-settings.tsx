'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { S, t, T, surface, btn, input } from '@/lib/ui';
import { isAppLockEnabled, enableAppLock, disableAppLock } from '@/lib/app-lock';
import { useVisbWallet } from '@/lib/wallet';

type Session = {
  session_id: string;
  user_agent: string | null;
  platform: string | null;
  created_at: string;
  last_seen_at: string;
};

function SecRow({ icon, label, sublabel, right, border = true }: {
  icon: React.ReactNode; label: string; sublabel?: string; right?: React.ReactNode; border?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: '12px 16px', borderBottom: border ? '1px solid var(--divider)' : 'none' }}>
      <div style={{ ...surface({ radius: 'var(--r-sm)' }), width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...t('body'), color: T.textStrong }}>{label}</div>
        {sublabel && <div style={{ ...t('meta'), color: T.textMuted, marginTop: 1 }}>{sublabel}</div>}
      </div>
      {right}
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{ width: 44, height: 26, borderRadius: 13, background: on ? T.gradBrand : 'var(--surface-bg)', border: `1.5px solid ${on ? 'transparent' : 'var(--glass-border)'}`, position: 'relative', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--text-muted)', position: 'absolute', top: 1, left: on ? 20 : 1, transition: 'left .2s' }} />
    </button>
  );
}

const stroke = { fill: 'none', stroke: 'var(--text-muted)', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export default function SecuritySettings() {
  const privy = usePrivy() as any;
  const { user, getAccessToken } = privy;
  const mfaMethods: string[] = (user?.mfaMethods ?? []) as string[];
  const passkeyCount = ((user?.linkedAccounts ?? []) as any[]).filter((a) => a.type === 'passkey').length;

  const [appLock, setAppLock] = useState(false);
  const [appLockMsg, setAppLockMsg] = useState('');
  useEffect(() => { setAppLock(isAppLockEnabled()); }, []);
  async function toggleAppLock() {
    setAppLockMsg('');
    if (appLock) { disableAppLock(); setAppLock(false); return; }
    const r = await enableAppLock(user?.email?.address || 'Visby');
    if (r.ok) setAppLock(true);
    else setAppLockMsg(r.reason === 'unsupported' ? 'This device can’t do Face ID / passkey lock.' : 'Couldn’t turn on app lock — try again.');
  }

  const [sessions, setSessions] = useState<Session[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const loadSessions = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/security/sessions', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return;
      const j = await res.json();
      setSessions(Array.isArray(j.sessions) ? j.sessions : []);
      setCurrent(j.current ?? null);
    } catch { /* non-fatal */ }
  }, [getAccessToken]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function revoke(action: 'revoke_one' | 'revoke_others', session_id?: string) {
    setBusy(session_id ?? action);
    try {
      const token = await getAccessToken();
      await fetch('/api/security/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, session_id }),
      });
      await loadSessions();
    } finally { setBusy(null); }
  }

  const { address: wallet } = useVisbWallet();
  const [hasPassword, setHasPassword] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwMode, setPwMode] = useState<'set' | 'change' | 'forgot'>('set');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }, [getAccessToken]);

  const loadPasswordStatus = useCallback(async () => {
    if (!wallet) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/account/security?wallet=${encodeURIComponent(wallet)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const j = await res.json();
      setHasPassword(!!j.hasPassword);
    } catch { /* non-fatal */ }
  }, [wallet, getAccessToken]);
  useEffect(() => { loadPasswordStatus(); }, [loadPasswordStatus]);

  function resetPwForm() {
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setResetCode(''); setPwMsg(''); setPwErr('');
  }
  function openPwForm() {
    resetPwForm();
    setPwMode(hasPassword ? 'change' : 'set');
    setShowPwForm(true);
  }
  function closePwForm() {
    setShowPwForm(false);
    resetPwForm();
  }

  async function submitSetPassword() {
    setPwErr(''); setPwMsg('');
    if (newPw !== confirmPw) { setPwErr('Passwords don’t match.'); return; }
    setPwBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/account/password/set', {
        method: 'POST',
        headers,
        body: JSON.stringify({ wallet, new_password: newPw, ...(hasPassword ? { current_password: currentPw } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwErr(j.error === 'wrong_password' ? 'Current password is incorrect.' : (j.error || 'Couldn’t save password — try again.'));
        return;
      }
      setHasPassword(true);
      setPwMsg(hasPassword ? 'Password changed.' : 'Password set.');
      setTimeout(closePwForm, 900);
    } catch {
      setPwErr('Couldn’t save password — try again.');
    } finally {
      setPwBusy(false);
    }
  }

  async function requestReset() {
    setPwErr(''); setPwMsg('');
    setPwBusy(true);
    try {
      const headers = await authHeaders();
      await fetch('/api/account/password/reset/request', { method: 'POST', headers, body: JSON.stringify({ wallet }) });
      setPwMode('forgot');
      setPwMsg('Check your email for a reset code.');
    } catch {
      setPwErr('Couldn’t send a reset code — try again.');
    } finally {
      setPwBusy(false);
    }
  }

  async function submitResetConfirm() {
    setPwErr(''); setPwMsg('');
    if (newPw !== confirmPw) { setPwErr('Passwords don’t match.'); return; }
    setPwBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/account/password/reset/confirm', {
        method: 'POST',
        headers,
        body: JSON.stringify({ wallet, token: resetCode, new_password: newPw }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwErr(j.error === 'bad_or_expired_token' ? 'That code is invalid or expired.' : (j.error || 'Couldn’t reset password — try again.'));
        return;
      }
      setHasPassword(true);
      setPwMsg('Password reset.');
      setTimeout(closePwForm, 900);
    } catch {
      setPwErr('Couldn’t reset password — try again.');
    } finally {
      setPwBusy(false);
    }
  }

  // Privy raises its own modal for these; both require MFA/passkeys enabled in the Privy dashboard.
  async function manage2fa() {
    setErr('');
    try { await privy.enrollInMfa?.(); }
    catch { setErr('Two-factor sign-in isn’t available yet — it’s being enabled.'); }
  }
  async function addPasskey() {
    setErr('');
    try { await privy.linkPasskey?.(); }
    catch { setErr('Passkeys aren’t available yet — they’re being enabled.'); }
  }

  const others = sessions.filter((s) => s.session_id !== current);

  return (
    <div>
      <SecRow
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
        label="Two-factor authentication"
        sublabel={mfaMethods.length ? `On — ${mfaMethods.join(', ')}` : 'Authenticator-app code, required to sign in'}
        right={<button onClick={manage2fa} style={{ ...btn('secondary', { pill: false }), padding: '7px 14px', color: T.textMuted }}>{mfaMethods.length ? 'Manage' : 'Set up'}</button>}
      />
      <SecRow
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15" r="1.4" fill="var(--text-muted)" stroke="none" /></svg>}
        label="Password"
        sublabel={hasPassword ? 'On' : 'Add a password to your account'}
        right={<button onClick={openPwForm} style={{ ...btn('secondary', { pill: false }), padding: '7px 14px', color: T.textMuted }}>{hasPassword ? 'Change' : 'Set up'}</button>}
      />
      {showPwForm && (
        <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {pwMode === 'change' && (
            <>
              <input type="password" placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} style={input()} autoComplete="current-password" />
              <button onClick={requestReset} disabled={pwBusy} style={{ ...btn('text'), fontSize: 12, alignSelf: 'flex-start', padding: '4px 0' }}>Forgot password?</button>
            </>
          )}
          {pwMode === 'forgot' && (
            <input type="text" placeholder="Emailed code" value={resetCode} onChange={(e) => setResetCode(e.target.value)} style={input()} autoComplete="one-time-code" />
          )}
          {(pwMode === 'set' || pwMode === 'change' || pwMode === 'forgot') && (
            <>
              <input type="password" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={input()} autoComplete="new-password" />
              <input type="password" placeholder="Confirm password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={input()} autoComplete="new-password" />
            </>
          )}
          {pwErr && <div style={{ ...t('meta'), color: 'var(--danger)' }}>{pwErr}</div>}
          {pwMsg && !pwErr && <div style={{ ...t('meta'), color: 'var(--ok)' }}>{pwMsg}</div>}
          <div style={{ display: 'flex', gap: S[2], marginTop: S[1] }}>
            <button
              onClick={pwMode === 'forgot' ? submitResetConfirm : submitSetPassword}
              disabled={pwBusy || !newPw || !confirmPw || (pwMode === 'forgot' && !resetCode) || (pwMode === 'change' && !currentPw)}
              style={{ ...btn('primary'), flex: 1, fontSize: 13, opacity: pwBusy ? 0.7 : 1 }}
            >
              {pwBusy ? 'Saving…' : pwMode === 'forgot' ? 'Reset password' : hasPassword ? 'Change password' : 'Set password'}
            </button>
            <button onClick={closePwForm} style={{ ...btn('secondary'), fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}
      <SecRow
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" /></svg>}
        label="Passkeys"
        sublabel={passkeyCount ? `${passkeyCount} passkey${passkeyCount === 1 ? '' : 's'} — Face ID / fingerprint sign-in` : 'Sign in with Face ID / fingerprint — no password'}
        right={<button onClick={addPasskey} style={{ ...btn('secondary', { pill: false }), padding: '7px 14px', color: T.textMuted }}>Add</button>}
      />
      <SecRow
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}
        label="App lock"
        sublabel="Require Face ID / passkey each time you open Visby"
        right={<Toggle on={appLock} onToggle={toggleAppLock} />}
      />
      {appLockMsg && <div style={{ ...t('micro'), color: 'var(--danger)', padding: `0 ${S[4]}px ${S[3]}px ${S[7]}px` }}>{appLockMsg}</div>}
      <SecRow
        border={false}
        icon={<svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
        label="Active sessions"
        sublabel={sessions.length ? `${sessions.length} device${sessions.length === 1 ? '' : 's'} signed in` : 'No other devices'}
        right={<button onClick={() => setShowSessions((s) => !s)} style={{ ...btn('secondary', { pill: false }), padding: '7px 14px', color: T.textMuted }}>{showSessions ? 'Hide' : 'View'}</button>}
      />

      {showSessions && (
        <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {sessions.length === 0 && <div style={{ ...t('meta'), color: T.textMuted, paddingTop: S[2] }}>This is your only signed-in device.</div>}
          {sessions.map((s) => {
            const isCurrent = s.session_id === current;
            return (
              <div key={s.session_id} style={{ ...surface({ radius: 'var(--r-sm)', pad: '10px 12px' }), display: 'flex', alignItems: 'center', gap: S[2] }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('meta'), color: T.textStrong }}>
                    {s.platform || 'Device'}{isCurrent && <span style={{ ...t('micro'), color: 'var(--ok)', marginLeft: S[2] }}>This device</span>}
                  </div>
                  <div style={{ ...t('micro'), color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {new Date(s.last_seen_at).toLocaleString()}{s.user_agent ? ` · ${s.user_agent.slice(0, 40)}` : ''}
                  </div>
                </div>
                {!isCurrent && (
                  <button onClick={() => revoke('revoke_one', s.session_id)} disabled={busy === s.session_id}
                    style={{ ...btn('text'), fontSize: 12, color: 'var(--danger)' }}>
                    {busy === s.session_id ? '…' : 'Log out'}
                  </button>
                )}
              </div>
            );
          })}
          {others.length > 0 && (
            <button onClick={() => revoke('revoke_others')} disabled={busy === 'revoke_others'}
              style={{ ...btn('secondary'), fontSize: 13, marginTop: S[1] }}>
              {busy === 'revoke_others' ? 'Logging out…' : 'Log out all other devices'}
            </button>
          )}
        </div>
      )}

      {err && <div style={{ ...t('meta'), color: 'var(--danger)', padding: '0 16px 12px' }}>{err}</div>}
    </div>
  );
}
