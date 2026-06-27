'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { useVisbWallet } from '@/lib/wallet';
import { trpc } from '@/lib/trpc/client';
import { sendSol } from '@/lib/transfer-client';
import { t, S, surface, btn, badge, avatar, T } from '@/lib/ui';

type Step = 'idle' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error';

function shortWallet(w: string) {
  return w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

function Spinner() {
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', opacity: .7, animation: 'spin .8s linear infinite', flexShrink: 0 }} />;
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function SendMoney({ onSent }: { onSent?: () => void }) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { address: fromWallet } = useVisbWallet();

  const [recipientInput, setRecipientInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errMsg, setErrMsg] = useState('');
  const idemRef = useRef<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(recipientInput.trim()), 400);
    return () => clearTimeout(id);
  }, [recipientInput]);

  // Editing the recipient or amount starts a NEW transfer: drop the idempotency key (so a retry-after-edit
  // doesn't resurrect the stale prepared row) and clear any prior error.
  useEffect(() => {
    idemRef.current = null;
    setStep(s => (s === 'error' ? 'idle' : s));
  }, [debounced, amount]);

  const resolveQ = trpc.transfers.resolve.useQuery(
    { to: debounced },
    { enabled: debounced.length > 1, retry: false },
  );
  const recipient = debounced.length > 1 ? resolveQ.data ?? null : null;
  const resolving = debounced.length > 1 && resolveQ.isFetching;

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const inFlight = step === 'preparing' || step === 'signing' || step === 'confirming';
  const canSend = !!recipient && amountValid && !inFlight;

  function reset() {
    setStep('idle');
    setErrMsg('');
    setRecipientInput('');
    setDebounced('');
    setAmount('');
    idemRef.current = null;
  }

  async function send() {
    if (!recipient || !amountValid || !fromWallet) return;
    setErrMsg('');
    setStep('preparing');

    if (!idemRef.current) idemRef.current = crypto.randomUUID();
    const idem = idemRef.current;

    let prep: any;
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/transfer/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ from_wallet: fromWallet, to: recipientInput.trim(), token: 'SOL', amount: amountNum, idempotency_key: idem }),
      });
      prep = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || prep?.error === 'recipient_not_found') setErrMsg("We couldn't find that recipient.");
        else if (res.status === 403 || prep?.error === 'limit_exceeded') setErrMsg(`That's over your send limit (${prep?.reason ?? 'limit'}).`);
        else setErrMsg(prep?.error ?? 'Could not start the transfer.');
        setStep('error');
        return;
      }
    } catch {
      setErrMsg('Network error — could not start the transfer.');
      setStep('error');
      return;
    }

    const toWallet: string = prep.to_wallet;
    const transferId: string = prep.transfer_id;

    setStep('signing');
    const solWallet = wallets.find((w: any) => w.address === fromWallet);
    if (!solWallet || typeof (solWallet as any).signTransaction !== 'function') {
      setErrMsg("This wallet can't sign on this device.");
      setStep('error');
      return;
    }

    let signature: string;
    try {
      signature = await sendSol({ fromWallet, toWallet, amountSol: amountNum, solWallet });
    } catch (err: any) {
      const m = String(err?.message ?? '');
      const lowFunds = /insufficient|prior credit|debit an account|0x1\b/i.test(m);
      setErrMsg(lowFunds || !m ? 'Transfer failed — check your balance and try again.' : m);
      setStep('error');
      return;
    }

    setStep('confirming');
    try {
      const token = await getAccessToken();
      await fetch('/api/transfer/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ transfer_id: transferId, from_wallet: fromWallet, tx_hash: signature }),
      });
    } catch {
      // The on-chain tx already landed; a failed confirm only delays the ledger update, so still show success.
    }

    setStep('done');
    onSent?.();
  }

  const buttonLabel =
    step === 'preparing' ? 'Checking…'
      : step === 'signing' ? 'Approve in your wallet…'
        : step === 'confirming' ? 'Confirming…'
          : 'Send';

  const recipientLabel = recipient
    ? (recipient.display_name || recipient.handle || shortWallet(recipient.wallet))
    : '';

  if (step === 'done') {
    return (
      <div style={{ ...surface({ pad: S[5], radius: 'var(--r-lg)' }), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3], textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckIcon color="var(--ok)" />
        </div>
        <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>
          Sent {amountNum} SOL to {recipientLabel}.
        </div>
        <button onClick={reset} style={btn('secondary')}>Send another</button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>Send money</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>
        Send SOL to a Visby handle or any Solana wallet. Non-custodial — you sign it.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        {/* Recipient */}
        <div>
          <input
            value={recipientInput}
            onChange={e => setRecipientInput(e.target.value)}
            placeholder="Visby handle or Solana wallet"
            disabled={inFlight}
            style={{
              width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)',
              borderRadius: 'var(--r-sm)', padding: '13px 16px', color: 'var(--text)', fontSize: 15,
              fontFamily: "'Manrope',sans-serif", outline: 'none',
            }}
          />
          {debounced.length > 1 && (
            <div style={{ marginTop: S[2] }}>
              {resolving ? (
                <div style={{ ...t('meta'), color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: S[2] }}>
                  <Spinner /> Looking up…
                </div>
              ) : recipient ? (
                <div style={{ ...surface({ pad: '8px 12px', radius: 'var(--pill)' }), display: 'inline-flex', alignItems: 'center', gap: S[2] }}>
                  {recipient.avatar_url ? (
                    <img src={recipient.avatar_url} alt="" style={{ ...avatar('sm'), objectFit: 'cover' }} />
                  ) : (
                    <div style={{ ...avatar('sm'), background: 'var(--grad-brand)' }}>
                      {(recipient.display_name || recipient.handle || 'S').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ ...t('body'), color: 'var(--text-strong)' }}>{recipientLabel}</span>
                    <span style={{ ...t('micro'), color: 'var(--text-muted)', fontFamily: 'monospace' }}>{shortWallet(recipient.wallet)}</span>
                  </span>
                </div>
              ) : (
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  No Visby user found — paste a Solana wallet address.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Amount + token */}
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="0.00"
            disabled={inFlight}
            style={{
              flex: 1, minWidth: 0, background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)',
              borderRadius: 'var(--r-sm)', padding: '13px 16px', color: 'var(--text)', fontSize: 15,
              fontFamily: "'Manrope',sans-serif", outline: 'none',
            }}
          />
          <div style={{ ...badge('default'), background: 'var(--grad-brand)', color: 'var(--text-on-cta)', border: 'none', padding: '8px 12px', fontSize: 13 }}>SOL</div>
          <div style={{ ...badge('default'), opacity: .5, padding: '8px 12px', fontSize: 13, cursor: 'not-allowed' }} title="Coming soon">USDC (soon)</div>
        </div>

        {errMsg && (
          <div style={{ background: 'var(--danger-soft)', borderRadius: 'var(--r-sm)', padding: '10px 14px', ...t('body'), color: 'var(--danger)' }}>
            {errMsg}
          </div>
        )}

        <button onClick={send} disabled={!canSend} style={{ ...btn('primary', { full: true }), opacity: canSend ? 1 : .55, cursor: canSend ? 'pointer' : 'not-allowed' }}>
          {inFlight ? <><Spinner /> {buttonLabel}</> : buttonLabel}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
