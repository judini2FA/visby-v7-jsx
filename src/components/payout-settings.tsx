'use client';

import { useEffect, useState } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { t, S, surface, btn, sectionLabel, input } from '@/lib/ui';
import { createStepUpProof, stepUpHeader, STEP_UP_ON } from '@/lib/step-up-client';
import { payoutAction } from '@/lib/step-up-shared';
import { friendlyError } from '@/lib/friendly-error';

const GREEN = 'var(--ok)';
const RED   = 'var(--danger)';

export default function PayoutSettings({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const { wallets: solSigners } = useSolanaWallets();
  const [payoutType, setPayoutType] = useState<'bank' | 'crypto'>('crypto');
  const [stripeAccountId, setStripeAccountId] = useState('');
  const [cryptoWallet,    setCryptoWallet]    = useState(wallet);
  const [cryptoChain,     setCryptoChain]     = useState('solana');
  const [payoutAsset,     setPayoutAsset]     = useState<'SOL' | 'USDC'>('SOL');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  // payout-was-saved gate for the test-payout affordance
  const [savedType, setSavedType] = useState<'bank' | 'crypto' | null>(null);
  const [savedAcct, setSavedAcct] = useState('');

  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testMsg,    setTestMsg]    = useState('');

  const [connect, setConnect] = useState<{ onboarded: boolean; payouts_enabled: boolean; charges_enabled: boolean; details_submitted: boolean } | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectMsg, setConnectMsg] = useState('');

  useEffect(() => {
    if (!wallet) return;
    (async () => {
      const token = await getAccessToken();
      return fetch(`/api/payout?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
    })()
      .then(r => r.json())
      .then(d => {
        if (!d.settings) return;
        setPayoutType(d.settings.payout_type ?? 'crypto');
        setStripeAccountId(d.settings.stripe_account_id ?? '');
        setCryptoWallet(d.settings.crypto_wallet ?? wallet);
        setCryptoChain(d.settings.crypto_chain ?? 'solana');
        setPayoutAsset(d.settings.payout_asset === 'USDC' ? 'USDC' : 'SOL');
        setSavedType(d.settings.payout_type ?? null);
        setSavedAcct(d.settings.stripe_account_id ?? '');
      })
      .catch(() => {});
  }, [wallet]);

  async function loadConnect() {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/connect/status?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setConnect(data);
    } catch { /* leave connect as-is */ }
  }

  useEffect(() => {
    if (!wallet) return;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const connectParam = params.get('connect');

      if (connectParam === 'return') {
        try {
          const token = await getAccessToken();
          const res = await fetch('/api/connect/refresh', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ wallet }),
          });
          if (res.ok) setConnect(await res.json());
          window.history.replaceState({}, '', window.location.pathname);
        } catch {
          await loadConnect();
        }
      } else if (connectParam === 'refresh') {
        window.history.replaceState({}, '', window.location.pathname);
        await loadConnect();
      } else {
        await loadConnect();
      }
    })();
  }, [wallet]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving'); setErrMsg('');
    try {
      const token = await getAccessToken();
      // Step-up: when enforced, sign a fresh MFA-gated challenge before redirecting payouts. Dormant
      // (no signing prompt) until NEXT_PUBLIC_STEP_UP_ENFORCED=1.
      let stepUp: Record<string, string> = {};
      if (STEP_UP_ON) {
        const signer = solSigners.find(w => w.address === wallet);
        if (!signer?.signMessage) throw new Error('This wallet can’t authorize the change on this device.');
        const proof = await createStepUpProof({ action: payoutAction(payoutType, payoutType === 'bank' ? 'connect' : cryptoWallet), signMessage: signer.signMessage });
        stepUp = stepUpHeader(proof);
      }
      const res = await fetch('/api/payout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...stepUp },
        body: JSON.stringify({
          seller_wallet: wallet,
          payout_type: payoutType,
          stripe_account_id: undefined,
          crypto_wallet:     payoutType === 'crypto' ? cryptoWallet    : undefined,
          crypto_chain:      payoutType === 'crypto' ? cryptoChain     : undefined,
          payout_asset:      payoutType === 'crypto' ? payoutAsset     : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setStatus('saved');
      setSavedType(payoutType);
      setSavedAcct(payoutType === 'bank' ? stripeAccountId : '');
      setTestStatus('idle'); setTestMsg('');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err: any) { setErrMsg(friendlyError(err, 'Could not save payout settings — try again.')); setStatus('error'); }
  }

  async function startConnectOnboarding() {
    setConnectBusy(true); setConnectMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/connect/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setConnectMsg(data.error ?? 'Could not start bank onboarding');
      setConnectBusy(false);
    } catch (err: any) {
      setConnectMsg(friendlyError(err, 'Could not start bank onboarding.'));
      setConnectBusy(false);
    }
  }

  async function sendTestPayout() {
    setTestStatus('sending'); setTestMsg('');
    try {
      const token = await getAccessToken();
      const res  = await fetch('/api/payout/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ seller_wallet: wallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Test payout failed');
      setTestStatus('sent');
      setTestMsg(`Sent — payout ${data.payout_id} ($${(data.amount / 100).toFixed(2)}, ${data.status}). It'll arrive in your linked account shortly.`);
    } catch (err: any) { setTestMsg(friendlyError(err, 'Test payout failed.')); setTestStatus('error'); }
  }

  const canTest = savedType === 'bank' && !!savedAcct;

  return (
    <div>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>Payout Settings</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>
        Choose how you receive payment when an item sells.
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
          {(['crypto', 'bank'] as const).map(pt => {
            const sel = payoutType === pt;
            return (
              <button key={pt} type="button" onClick={() => setPayoutType(pt)}
                style={{ ...surface({ pad: '14px 12px' }), cursor: 'pointer', textAlign: 'left', position: 'relative', boxShadow: sel ? '0 4px 16px rgba(90,160,210,.22)' : 'var(--box-shadow-soft)' }}>
                <div style={{ ...t('body'), fontWeight: 700, marginBottom: S[1], ...(sel ? { background: 'var(--grad-brand)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: 'var(--text-strong)' }) }}>
                  {pt === 'crypto' ? 'Crypto wallet' : 'Bank account'}
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  {pt === 'crypto' ? 'SOL/USDC · instant' : 'bank transfer · 2–7 days'}
                </div>
                {sel && (
                  <span style={{ position: 'absolute', top: 10, right: 10, width: 16, height: 16, borderRadius: '50%', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-on-cta)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {payoutType === 'crypto' && (
          <>
            <div>
              <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Receiving wallet</div>
              <input value={cryptoWallet} onChange={e => setCryptoWallet(e.target.value)} placeholder="Solana wallet address" style={input()} />
            </div>
            <div>
              <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Chain</div>
              <select value={cryptoChain} onChange={e => setCryptoChain(e.target.value)}
                style={{ ...input(), cursor: 'pointer' }}>
                <option value="solana">Solana (SOL / USDC)</option>
                <option value="ethereum">Ethereum (ETH / USDC)</option>
              </select>
            </div>
            <div>
              <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Receive as</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
                {([['SOL', 'SOL', 'Native · price moves'], ['USDC', 'USDC', 'Stablecoin · steady $1']] as const).map(([val, label, sub]) => {
                  const sel = payoutAsset === val;
                  return (
                    <button key={val} type="button" onClick={() => setPayoutAsset(val)}
                      style={{ ...surface({ pad: '12px' }), cursor: 'pointer', textAlign: 'left', boxShadow: sel ? '0 4px 16px rgba(90,160,210,.22)' : 'var(--box-shadow-soft)' }}>
                      <div style={{ ...t('body'), fontWeight: 700, marginBottom: 2, ...(sel ? { background: 'var(--grad-brand)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: 'var(--text-strong)' }) }}>{label}</div>
                      <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{sub}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ ...t('micro'), color: 'var(--text-muted)', marginTop: S[2] }}>
                Paid on Solana. USDC holds a steady $1 — no price swings between sale and payout.
              </div>
            </div>
          </>
        )}

        {payoutType === 'bank' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {connect?.payouts_enabled ? (
              <div style={{ ...surface({ pad: '14px 16px' }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <div style={{ ...t('body'), fontWeight: 700, color: GREEN }}>Bank connected — payouts enabled</div>
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  Your bank is verified and ready to receive payouts.
                </div>
                <button type="button" onClick={startConnectOnboarding} disabled={connectBusy}
                  style={{ ...btn('text'), alignSelf: 'flex-start', padding: 0, opacity: connectBusy ? 0.7 : 1, cursor: connectBusy ? 'not-allowed' : 'pointer' }}>
                  {connectBusy ? 'Opening…' : 'Manage / update bank'}
                </button>
              </div>
            ) : connect?.onboarded ? (
              <div style={{ ...surface({ pad: '14px 16px' }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  Bank setup started but not finished — Stripe still needs a few details.
                </div>
                <button type="button" onClick={startConnectOnboarding} disabled={connectBusy}
                  style={{ ...btn('primary', { full: true }), opacity: connectBusy ? 0.7 : 1, cursor: connectBusy ? 'not-allowed' : 'pointer' }}>
                  {connectBusy ? 'Opening…' : 'Finish bank setup'}
                </button>
              </div>
            ) : (
              <div style={{ ...surface({ pad: '14px 16px' }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  Connect your bank through Stripe to receive payouts as cash. Takes ~2 minutes.
                </div>
                <button type="button" onClick={startConnectOnboarding} disabled={connectBusy}
                  style={{ ...btn('primary', { full: true }), opacity: connectBusy ? 0.7 : 1, cursor: connectBusy ? 'not-allowed' : 'pointer' }}>
                  {connectBusy ? 'Opening…' : 'Connect bank account'}
                </button>
              </div>
            )}
            {connectMsg && <div style={{ ...t('meta'), color: RED }}>{connectMsg}</div>}
          </div>
        )}

        {errMsg && <div style={{ ...surface({ pad: '10px 14px' }), ...t('body'), color: RED, borderColor: 'var(--danger-soft)' }}>{errMsg}</div>}

        <button type="submit" disabled={status === 'saving' || (payoutType === 'bank' && !connect?.payouts_enabled)}
          style={{ ...btn(status === 'saved' ? 'secondary' : 'primary', { full: true }), opacity: (status === 'saving' || (payoutType === 'bank' && !connect?.payouts_enabled)) ? 0.7 : 1, cursor: (status === 'saving' || (payoutType === 'bank' && !connect?.payouts_enabled)) ? 'not-allowed' : 'pointer', color: status === 'saved' ? GREEN : undefined }}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save Payout Settings'}
        </button>
        {payoutType === 'bank' && !connect?.payouts_enabled && (
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: -S[2] }}>
            Finish connecting your bank to save this as your payout method.
          </div>
        )}
      </form>

      {canTest && (
        <div style={{ ...surface({ pad: '14px 16px' }), marginTop: S[5], display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div>
            <div style={{ ...t('body'), fontWeight: 700, color: 'var(--text-strong)', marginBottom: S[1] }}>Send a test payout</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
              Fires a $1.00 test payout so you can confirm it lands in your account.
            </div>
          </div>
          <button type="button" onClick={sendTestPayout} disabled={testStatus === 'sending'}
            style={{ ...btn('secondary', { full: true }), opacity: testStatus === 'sending' ? 0.7 : 1, cursor: testStatus === 'sending' ? 'not-allowed' : 'pointer' }}>
            {testStatus === 'sending' ? 'Sending…' : 'Send $1.00 test payout'}
          </button>
          {testMsg && (
            <div style={{ ...t('meta'), color: testStatus === 'error' ? RED : GREEN, lineHeight: 1.5 }}>{testMsg}</div>
          )}
        </div>
      )}
    </div>
  );
}
