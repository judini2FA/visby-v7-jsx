'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { trpc } from '@/lib/trpc/client';
import { sendSol, sendUsdc } from '@/lib/transfer-client';
import { useCurrency } from '@/lib/currency';
import { biometricConfirm, biometricAvailable } from '@/lib/app-lock';
import { t, S, surface, btn, badge, avatar } from '@/lib/ui';

type Mode = 'pay' | 'request';
type Token = 'SOL' | 'USDC';
type Step = 'idle' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error';

type FixedRecipient = { wallet: string; display_name?: string | null; avatar_url?: string | null };

function shortWallet(w: string) {
  return w && w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || '');
}

// A token amount → its USDC (≈ USD) value, ready for format(). SOL needs the live price; if it isn't
// loaded the caller falls back to showing the raw token amount.
function tokenUsdc(amount: number, token: string, solUsd: number | null): number | null {
  if (token === 'USDC') return amount;
  return solUsd ? amount * solUsd : null;
}

function Spinner() {
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', opacity: .7, animation: 'spin .8s linear infinite', flexShrink: 0 }} />;
}

function ScanIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9 15c.83.67 1.94 1 3 1s2.17-.33 3-1" />
    </svg>
  );
}

function initial(name?: string | null, fallback = 'V') {
  return (name || fallback).slice(0, 1).toUpperCase();
}

type SelectedRecipient = { wallet: string; display_name?: string | null; handle?: string | null; avatar_url?: string | null };

export default function PayRequest({ wallet, onDone, fixedRecipient }: { wallet: string; onDone?: () => void; fixedRecipient?: FixedRecipient }) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { symbol, toUsdc, currency, format } = useCurrency();

  const [mode, setMode] = useState<Mode>('pay');
  const [token, setToken] = useState<Token>('SOL');
  const [recipientInput, setRecipientInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<SelectedRecipient | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState('');
  // Exact token amount when fulfilling a request — paid verbatim, no fiat round-trip → no rounding drift.
  const [lockedAmount, setLockedAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const idemRef = useRef<string | null>(null);
  // When a Pay is launched from an incoming request, hold its id + the requester's wallet, so a confirm
  // only closes the request if the money actually went to THAT wallet (the user may have edited it).
  const fulfilling = useRef<{ id: string; wallet: string } | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);

  const requestsQ = trpc.transfers.requests.useQuery({ wallet }, { enabled: !!wallet && !fixedRecipient });

  useEffect(() => {
    const id = setTimeout(() => setDebounced(recipientInput.trim()), 400);
    return () => clearTimeout(id);
  }, [recipientInput]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/price/sol')
      .then(r => r.json())
      .then((j: { usd: number | null }) => {
        if (!cancelled) {
          const v = Number(j?.usd);
          setSolUsd(Number.isFinite(v) && v > 0 ? v : null);
        }
      })
      .catch(() => { if (!cancelled) setSolUsd(null); });
    return () => { cancelled = true; };
  }, []);

  // Editing recipient/amount starts a NEW transfer: drop the idempotency key and clear stale errors.
  useEffect(() => {
    idemRef.current = null;
    setStep(s => (s === 'error' ? 'idle' : s));
    setErrMsg('');
  }, [selected, amount]);

  const fiatNum = Number(amount);
  const priced = solUsd != null && solUsd > 0;
  const usdValue = toUsdc(fiatNum);
  const sendAmount =
    lockedAmount != null ? lockedAmount
    : token === 'USDC' ? usdValue
    : currency === 'SOL' ? fiatNum
    : priced ? usdValue / (solUsd as number)
    : fiatNum;
  const amountValid = Number.isFinite(sendAmount) && sendAmount > 0;
  const sendDisplay = Number(sendAmount.toFixed(token === 'USDC' ? 2 : 4));
  // When fulfilling a request, or when the view currency IS SOL, the field already holds token units —
  // show no fiat symbol.
  const amountSymbol = lockedAmount != null ? '' : (priced && currency !== 'SOL' ? symbol : '');

  const recipient: SelectedRecipient | null = fixedRecipient
    ? { wallet: fixedRecipient.wallet, display_name: fixedRecipient.display_name ?? null, avatar_url: fixedRecipient.avatar_url ?? null }
    : selected;
  const toWalletValue = recipient?.wallet ?? '';

  const inFlight = step === 'preparing' || step === 'signing' || step === 'confirming';
  const hasRecipient = !!recipient;
  const canSubmit = hasRecipient && amountValid && !inFlight;

  const recipientLabel = recipient
    ? (recipient.display_name || recipient.handle || shortWallet(recipient.wallet))
    : '';

  function clearSelection() {
    setSelected(null);
    setRecipientInput('');
    setDebounced('');
  }

  function resetForm() {
    clearSelection();
    setAmount('');
    setLockedAmount(null);
    setNote('');
    setStep('idle');
    setErrMsg('');
    setConfirmOpen(false);
    setPickerOpen(false);
    idemRef.current = null;
    fulfilling.current = null;
  }

  async function doPay() {
    if (!recipient || !amountValid || !wallet) return;
    setErrMsg('');
    setSuccessMsg('');
    setStep('preparing');

    if (!idemRef.current) idemRef.current = crypto.randomUUID();
    const idem = idemRef.current;

    let prep: any;
    try {
      const authToken = await getAccessToken();
      const res = await fetch('/api/transfer/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ from_wallet: wallet, to: toWalletValue, token, amount: sendAmount, idempotency_key: idem }),
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
    const solWallet = wallets.find((w: any) => w.address === wallet);
    if (!solWallet || typeof (solWallet as any).signTransaction !== 'function') {
      setErrMsg("This wallet can't sign on this device.");
      setStep('error');
      return;
    }

    let signature: string;
    try {
      signature = token === 'USDC'
        ? await sendUsdc({ fromWallet: wallet, toWallet, amountUsdc: sendAmount, solWallet })
        : await sendSol({ fromWallet: wallet, toWallet, amountSol: sendAmount, solWallet });
    } catch (err: any) {
      const m = String(err?.message ?? '');
      const lowFunds = /insufficient|prior credit|debit an account|0x1\b/i.test(m);
      setErrMsg(lowFunds || !m ? 'Transfer failed — check your balance and try again.' : m);
      setStep('error');
      return;
    }

    setStep('confirming');
    let confirmedSent = false;
    try {
      const authToken = await getAccessToken();
      const cres = await fetch('/api/transfer/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ transfer_id: transferId, from_wallet: wallet, tx_hash: signature }),
      });
      const cj = await cres.json().catch(() => ({}));
      confirmedSent = cj?.status === 'sent';
    } catch {
      // The on-chain tx is already broadcast; a failed confirm only delays the ledger update.
    }

    // Close the request out ONLY if the money actually went to that request's requester.
    const fulfilled = fulfilling.current;
    if (fulfilled && fulfilled.wallet === toWallet) {
      try {
        const authToken = await getAccessToken();
        await fetch('/api/transfer/request', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          body: JSON.stringify({ request_id: fulfilled.id, action: 'mark_paid', transfer_id: transferId }),
        });
      } catch {
        // Non-fatal — the request stays pending and can be retried.
      }
    }

    setSuccessMsg(confirmedSent
      ? `Sent ${sendDisplay} ${token} to ${recipientLabel}.`
      : `Sent ${sendDisplay} ${token} to ${recipientLabel} — confirming on the network, it'll appear shortly.`);
    setStep('done');
    resetForm();
    requestsQ.refetch();
    onDone?.();
  }

  async function doRequest() {
    if (!recipient || !amountValid || !wallet) return;
    setErrMsg('');
    setSuccessMsg('');
    setStep('preparing');
    try {
      const authToken = await getAccessToken();
      const res = await fetch('/api/transfer/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ requester_wallet: wallet, to: toWalletValue, token, amount: sendAmount, note: note.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) setErrMsg("We couldn't find that person.");
        else setErrMsg(data?.error ?? 'Could not send the request.');
        setStep('error');
        return;
      }
    } catch {
      setErrMsg('Network error — could not send the request.');
      setStep('error');
      return;
    }

    const name = recipientLabel;
    setSuccessMsg(`Requested ${sendDisplay} ${token} from ${name}.`);
    setStep('done');
    resetForm();
    requestsQ.refetch();
    onDone?.();
  }

  function submit() {
    if (!canSubmit) return;
    setErrMsg('');
    setSuccessMsg('');
    setConfirmOpen(true);
  }

  async function runConfirmed() {
    if (!canSubmit) return;
    setErrMsg('');
    const passed = await biometricConfirm();
    if (!passed) {
      setErrMsg('Scan cancelled — not sent.');
      return;
    }
    if (mode === 'pay') await doPay();
    else await doRequest();
  }

  function prefillFromIncoming(r: RequestRow) {
    fulfilling.current = { id: r.id, wallet: r.requester_wallet };
    setMode('pay');
    setSelected({
      wallet: r.requester_wallet,
      display_name: r.other?.display_name ?? null,
      avatar_url: r.other?.avatar_url ?? null,
    });
    // Pay EXACTLY the requested token amount (lockedAmount drives the send), shown verbatim in the field.
    // Editing the field or flipping the token toggle clears the lock and reverts to normal currency entry.
    setToken((r.token === 'USDC' ? 'USDC' : 'SOL'));
    setLockedAmount(Number(r.amount));
    setAmount(String(r.amount));
    setSuccessMsg('');
    setStep('idle');
    requestAnimationFrame(() => amountRef.current?.focus());
  }

  async function patchRequest(request_id: string, action: 'decline' | 'cancel') {
    try {
      const authToken = await getAccessToken();
      await fetch('/api/transfer/request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ request_id, action }),
      });
    } catch {
      // ignore — refetch reflects the true state
    }
    requestsQ.refetch();
  }

  const scanReady = biometricAvailable();
  const actionLabel = mode === 'pay' ? 'Pay' : 'Request';
  const buttonLabel =
    step === 'preparing' ? 'Checking…'
      : step === 'signing' ? 'Approve in your wallet…'
        : step === 'confirming' ? 'Confirming…'
          : actionLabel;
  const confirmLabel = mode === 'pay'
    ? (scanReady ? 'Scan to send' : 'Send')
    : (scanReady ? 'Scan to request' : 'Request');

  const incoming = (requestsQ.data?.incoming ?? []) as RequestRow[];
  const outgoing = (requestsQ.data?.outgoing ?? []) as RequestRow[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
        {/* Fixed recipient header (messages view) */}
        {fixedRecipient && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: S[2], marginBottom: S[5] }}>
            <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>To</span>
            {fixedRecipient.avatar_url ? (
              <img src={fixedRecipient.avatar_url} alt="" style={{ ...avatar('sm'), objectFit: 'cover' }} />
            ) : (
              <div style={{ ...avatar('sm'), background: 'var(--grad-brand)' }}>{initial(fixedRecipient.display_name || fixedRecipient.wallet, 'S')}</div>
            )}
            <span style={{ ...t('body'), color: 'var(--text-strong)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fixedRecipient.display_name || shortWallet(fixedRecipient.wallet)}
            </span>
          </div>
        )}

        {/* Pay | Request segmented control */}
        <div
          style={{
            position: 'relative', display: 'flex', width: '100%',
            background: 'var(--field-input-bg)', borderRadius: 'var(--pill)',
            padding: 4, marginBottom: S[5],
          }}
        >
          <div
            style={{
              position: 'absolute', top: 4, bottom: 4, width: 'calc(50% - 4px)',
              left: mode === 'pay' ? 4 : 'calc(50% + 0px)',
              background: 'var(--grad-brand)', borderRadius: 'var(--pill)',
              boxShadow: '0 4px 14px rgba(0,0,0,.18)', transition: 'left .22s ease',
            }}
          />
          {(['pay', 'request'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={inFlight}
              style={{
                position: 'relative', zIndex: 1, flex: 1, background: 'transparent', border: 'none',
                cursor: inFlight ? 'default' : 'pointer', padding: '10px 0', textAlign: 'center',
                fontFamily: "'Manrope',sans-serif", fontSize: 15, fontWeight: 600,
                color: mode === m ? 'var(--text-on-cta)' : 'var(--text-muted)',
                transition: 'color .22s ease',
              }}
            >
              {m === 'pay' ? 'Pay' : 'Request'}
            </button>
          ))}
        </div>

        {/* Amount (preferred currency) — centered as a unit */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[1], marginBottom: S[5] }}>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'center', gap: 2, maxWidth: '100%' }}>
            {amountSymbol && (
              <span
                style={{
                  fontFamily: "'Manrope',sans-serif", fontSize: 48, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em',
                  background: amount ? 'var(--grad-brand-text)' : 'transparent',
                  WebkitBackgroundClip: amount ? 'text' : undefined,
                  backgroundClip: amount ? 'text' : undefined,
                  WebkitTextFillColor: amount ? 'transparent' : undefined,
                  color: amount ? undefined : 'var(--text-muted)',
                } as any}
              >
                {amountSymbol}
              </span>
            )}
            <input
              ref={amountRef}
              value={amount}
              onChange={e => {
                if (lockedAmount != null) setLockedAmount(null); // manual edit → normal currency entry
                const raw = e.target.value.replace(/[^0-9.]/g, '');
                const parts = raw.split('.');
                setAmount(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw);
              }}
              inputMode="decimal"
              placeholder="0"
              disabled={inFlight}
              style={{
                width: `${Math.max(1, (amount.length || 1))}ch`,
                textAlign: amountSymbol ? 'left' : 'center', border: 'none',
                outline: 'none', fontFamily: "'Manrope',sans-serif", fontSize: 48, fontWeight: 800, lineHeight: 1.1,
                letterSpacing: '-0.02em', padding: 0,
                background: amount ? 'var(--grad-brand-text)' : 'transparent',
                WebkitBackgroundClip: amount ? 'text' : undefined,
                backgroundClip: amount ? 'text' : undefined,
                WebkitTextFillColor: amount ? 'transparent' : undefined,
                color: amount ? undefined : 'var(--text-muted)',
              } as any}
            />
            {!amountSymbol && (
              <span style={{ ...t('micro'), color: 'var(--text-muted)', alignSelf: 'flex-end', marginBottom: 8 }}>{token}</span>
            )}
          </div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center' }}>
            {amountValid && (token === 'USDC' || priced)
              ? `≈ ${sendDisplay} ${token} · from primary wallet`
              : 'from primary wallet'}
          </div>

          {/* Token toggle */}
          <div style={{ display: 'flex', gap: S[2], marginTop: S[3] }}>
            {(['SOL', 'USDC'] as const).map(tk => {
              const active = token === tk;
              return (
                <button
                  key={tk}
                  onClick={() => { if (token !== tk) { setToken(tk); setLockedAmount(null); } }}
                  disabled={inFlight}
                  style={{
                    border: '1px solid var(--glass-border)', borderRadius: 'var(--pill)',
                    padding: '7px 18px', cursor: inFlight ? 'default' : 'pointer',
                    fontFamily: "'Manrope',sans-serif", fontSize: 14, fontWeight: 700,
                    background: active ? 'var(--grad-brand)' : 'var(--field-input-bg)',
                    color: active ? 'var(--text-on-cta)' : 'var(--text-muted)',
                    borderColor: active ? 'transparent' : 'var(--glass-border)',
                  }}
                >
                  {tk}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recipient — picker button / chip (hidden when fixedRecipient) */}
        {!fixedRecipient && (
          selected ? (
            <button
              onClick={() => setPickerOpen(true)}
              disabled={inFlight}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: S[3],
                background: 'var(--surface-bg)', border: '1px solid var(--glass-border)',
                borderRadius: 'var(--r-sm)', padding: '12px 14px', cursor: inFlight ? 'default' : 'pointer',
                textAlign: 'left', marginBottom: S[3],
              }}
            >
              {selected.avatar_url ? (
                <img src={selected.avatar_url} alt="" style={{ ...avatar('sm'), objectFit: 'cover' }} />
              ) : (
                <div style={{ ...avatar('sm'), background: 'var(--grad-brand)' }}>{initial(selected.display_name || selected.handle, 'S')}</div>
              )}
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0, flex: 1 }}>
                <span style={{ ...t('body'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipientLabel}</span>
                <span style={{ ...t('micro'), color: 'var(--text-muted)', fontFamily: 'monospace', textTransform: 'none', letterSpacing: 0 }}>{shortWallet(selected.wallet)}</span>
              </span>
              <span
                role="button"
                aria-label="Change recipient"
                onClick={(e) => { e.stopPropagation(); if (!inFlight) clearSelection(); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', flexShrink: 0, color: 'var(--text-muted)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </span>
            </button>
          ) : (
            <button
              onClick={() => setPickerOpen(true)}
              disabled={inFlight}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2],
                background: 'var(--surface-bg)', border: '1px solid var(--glass-border)',
                borderRadius: 'var(--r-sm)', padding: '14px 16px', cursor: inFlight ? 'default' : 'pointer',
                color: 'var(--text-muted)', fontFamily: "'Manrope',sans-serif", fontSize: 15, textAlign: 'left', marginBottom: S[3],
              }}
            >
              <span>{mode === 'pay' ? 'Pay to — handle or wallet' : 'Request from — handle or wallet'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )
        )}

        {/* Note */}
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What's it for?"
          disabled={inFlight}
          style={{
            width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--r-sm)', padding: '13px 16px', color: 'var(--text)', fontSize: 15,
            fontFamily: "'Manrope',sans-serif", outline: 'none', marginBottom: S[3],
          }}
        />

        {successMsg && (
          <div style={{ background: 'var(--ok-soft)', borderRadius: 'var(--r-sm)', padding: '10px 14px', ...t('body'), color: 'var(--ok)', marginBottom: S[3] }}>
            {successMsg}
          </div>
        )}

        {errMsg && (
          <div style={{ background: 'var(--danger-soft)', borderRadius: 'var(--r-sm)', padding: '10px 14px', ...t('body'), color: 'var(--danger)', marginBottom: S[3] }}>
            {errMsg}
          </div>
        )}

        <button onClick={submit} disabled={!canSubmit} style={{ ...btn('primary', { full: true }), opacity: canSubmit ? 1 : .55, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          {inFlight ? <><Spinner /> {buttonLabel}</> : buttonLabel}
        </button>
      </div>

      {/* Incoming requests — for you to pay */}
      {!fixedRecipient && incoming.length > 0 && (
        <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
          <div style={{ ...t('micro'), color: 'var(--text-muted)', marginBottom: S[4] }}>Requests for you</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {incoming.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: S[2], paddingTop: i ? S[3] : 0, ...(i ? { borderTop: '1px solid var(--divider)' } : null) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                  <div style={{ ...avatar('sm'), background: 'var(--grad-brand)' }}>
                    {initial(r.other?.display_name || r.requester_wallet)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ ...t('body'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.other?.display_name || shortWallet(r.requester_wallet)}
                    </div>
                    {r.note && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{r.note}</div>}
                  </div>
                  {(() => {
                    const usd = tokenUsdc(r.amount, r.token, solUsd);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                        <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>{usd != null ? format(usd) : `${r.amount} ${r.token}`}</div>
                        {usd != null && <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{r.amount} {r.token}</div>}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', gap: S[2] }}>
                  <button onClick={() => prefillFromIncoming(r)} style={{ ...btn('primary', { full: true }), padding: '9px 14px' }}>Pay</button>
                  <button onClick={() => patchRequest(r.id, 'decline')} style={{ ...btn('secondary', { full: true }), padding: '9px 14px', color: 'var(--text-muted)' }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing requests — you sent */}
      {!fixedRecipient && outgoing.length > 0 && (
        <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
          <div style={{ ...t('micro'), color: 'var(--text-muted)', marginBottom: S[4] }}>You requested</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {outgoing.map((r, i) => {
              const sb = outgoingStatus(r.status);
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: S[3], paddingTop: i ? S[3] : 0, ...(i ? { borderTop: '1px solid var(--divider)' } : null) }}>
                  <div style={{ ...avatar('sm'), background: 'var(--grad-brand)' }}>
                    {initial(r.other?.display_name || r.payer_wallet)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ ...t('body'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.other?.display_name || shortWallet(r.payer_wallet)}
                    </div>
                    {r.note && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{r.note}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {(() => {
                      const usd = tokenUsdc(r.amount, r.token, solUsd);
                      return (
                        <>
                          <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>{usd != null ? format(usd) : `${r.amount} ${r.token}`}</div>
                          {usd != null && <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{r.amount} {r.token}</div>}
                        </>
                      );
                    })()}
                    <span style={sb.style}>{sb.label}</span>
                  </div>
                  {r.status === 'pending' && (
                    <button onClick={() => patchRequest(r.id, 'cancel')} style={{ ...btn('text'), padding: '6px 10px', color: 'var(--text-muted)', flexShrink: 0 }}>Cancel</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recipient picker bottom-sheet */}
      {pickerOpen && !fixedRecipient && (
        <RecipientPicker
          wallet={wallet}
          mode={mode}
          onClose={() => setPickerOpen(false)}
          onPick={(p) => { setSelected(p); setRecipientInput(p.wallet); setDebounced(p.wallet); setPickerOpen(false); }}
        />
      )}

      {confirmOpen && recipient && typeof document !== 'undefined' && createPortal(
        <>
          <div
            onClick={() => { if (!inFlight) setConfirmOpen(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.5)' }}
          />
          <div
            style={{
              ...surface({ pad: S[6], radius: 'var(--r-xl)' }),
              position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
              width: '100%', maxWidth: 480, zIndex: 201, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
              display: 'flex', flexDirection: 'column', gap: S[5], maxHeight: '88vh', overflowY: 'auto',
            }}
          >
            <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2, margin: '0 auto' }} />

            <div style={{ ...t('title'), color: 'var(--text-strong)', textAlign: 'center' }}>
              {mode === 'pay' ? 'Confirm payment' : 'Confirm request'}
            </div>

            <div style={{ ...surface({ pad: S[4], radius: 'var(--r)' }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                {recipient.avatar_url ? (
                  <img src={recipient.avatar_url} alt="" style={{ ...avatar('md'), objectFit: 'cover' }} />
                ) : (
                  <div style={{ ...avatar('md'), background: 'var(--grad-brand)' }}>
                    {initial(recipient.display_name || recipient.handle, 'S')}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipientLabel}</div>
                  <div style={{ ...t('micro'), color: 'var(--text-muted)', fontFamily: 'monospace', textTransform: 'none', letterSpacing: 0 }}>{shortWallet(recipient.wallet)}</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--divider)', paddingTop: S[4], display: 'flex', flexDirection: 'column', gap: S[1], alignItems: 'center' }}>
                <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 32, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.02em' }}>
                  {amountSymbol ? `${symbol}${amount}` : `${sendDisplay} ${token}`}
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  {amountSymbol ? `≈ ${sendDisplay} ${token}` : `entered as ${token}`}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--divider)', paddingTop: S[3] }}>
                {mode === 'pay' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>From</span>
                    <span style={{ ...t('micro'), color: 'var(--text)', fontFamily: 'monospace', textTransform: 'none', letterSpacing: 0, wordBreak: 'break-all' }}>{wallet}</span>
                  </div>
                ) : (
                  <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                    {`To: ${recipientLabel} · Requesting: ${sendDisplay} ${token}`}
                  </div>
                )}
              </div>
            </div>

            {inFlight && (
              <div style={{ ...t('meta'), color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: S[2] }}>
                <Spinner /> {buttonLabel}
              </div>
            )}

            {errMsg && (
              <div style={{ background: 'var(--danger-soft)', borderRadius: 'var(--r-sm)', padding: '10px 14px', ...t('body'), color: 'var(--danger)' }}>
                {errMsg}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              <button
                onClick={runConfirmed}
                disabled={!canSubmit}
                style={{ ...btn('primary', { full: true }), opacity: canSubmit ? 1 : .55, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
              >
                {inFlight ? <><Spinner /> {buttonLabel}</> : (scanReady ? <><ScanIcon /> {confirmLabel}</> : confirmLabel)}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={inFlight}
                style={{ ...btn('secondary', { full: true }), color: 'var(--text-muted)', cursor: inFlight ? 'default' : 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function RecipientPicker({ wallet, mode, onClose, onPick }: {
  wallet: string;
  mode: Mode;
  onClose: () => void;
  onPick: (p: SelectedRecipient) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(id);
  }, [search]);

  const resolveQ = trpc.transfers.resolve.useQuery({ to: debounced }, { enabled: debounced.length > 1, retry: false });
  const resolving = debounced.length > 1 && resolveQ.isFetching;
  const resolved = debounced.length > 1 ? resolveQ.data ?? null : null;

  const recentsQ = trpc.transfers.recents.useQuery({ wallet }, { enabled: !!wallet });
  const followingQ = trpc.follows.getConnections.useQuery({ wallet, type: 'following', viewer_wallet: wallet }, { enabled: !!wallet });
  const followersQ = trpc.follows.getConnections.useQuery({ wallet, type: 'followers', viewer_wallet: wallet }, { enabled: !!wallet });

  const recents = (recentsQ.data ?? []) as Array<{ wallet: string; display_name: string | null; avatar_url: string | null }>;
  const following = (followingQ.data ?? []) as Array<{ wallet: string; display_name: string | null }>;
  const followers = (followersQ.data ?? []) as Array<{ wallet: string; display_name: string | null }>;

  const empty = useMemo(
    () => !resolved && !resolving && recents.length === 0 && following.length === 0 && followers.length === 0,
    [resolved, resolving, recents.length, following.length, followers.length],
  );

  if (typeof document === 'undefined') return null;

  function Row({ p }: { p: SelectedRecipient }) {
    return (
      <button
        onClick={() => onPick(p)}
        style={{ ...surface({ pad: '10px 12px' }), display: 'flex', alignItems: 'center', gap: S[3], cursor: 'pointer', textAlign: 'left', width: '100%', marginTop: S[2] }}
      >
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" style={{ ...avatar('sm'), objectFit: 'cover' }} />
        ) : (
          <div style={{ ...avatar('sm'), background: 'var(--grad-brand)' }}>{initial(p.display_name || p.handle, 'S')}</div>
        )}
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0, flex: 1 }}>
          <span style={{ ...t('body'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.display_name || p.handle || shortWallet(p.wallet)}
          </span>
          <span style={{ ...t('micro'), color: 'var(--text-muted)', fontFamily: 'monospace', textTransform: 'none', letterSpacing: 0 }}>{shortWallet(p.wallet)}</span>
        </span>
      </button>
    );
  }

  function Section({ label, people }: { label: string; people: SelectedRecipient[] }) {
    if (people.length === 0) return null;
    return (
      <div style={{ marginTop: S[4] }}>
        <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{label}</div>
        {people.map(p => <Row key={`${label}-${p.wallet}`} p={p} />)}
      </div>
    );
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,.5)' }} />
      <div
        style={{
          ...surface({ pad: S[5], radius: 'var(--r-xl)' }),
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 480, zIndex: 211, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
          display: 'flex', flexDirection: 'column', maxHeight: '88vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2, margin: `0 auto ${S[4]}px` }} />
        <div style={{ ...t('heading'), color: 'var(--text-strong)', textAlign: 'center', marginBottom: S[4] }}>
          {mode === 'pay' ? 'Pay to' : 'Request from'}
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
          placeholder="Handle or wallet address"
          style={{
            width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--r-sm)', padding: '13px 16px', color: 'var(--text)', fontSize: 15,
            fontFamily: "'Manrope',sans-serif", outline: 'none',
          }}
        />

        {debounced.length > 1 && (
          <div style={{ marginTop: S[3] }}>
            {resolving ? (
              <div style={{ ...t('meta'), color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: S[2] }}>
                <Spinner /> Looking up…
              </div>
            ) : resolved ? (
              <Row p={resolved} />
            ) : (
              <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>No Visby user found — paste a Solana wallet address.</div>
            )}
          </div>
        )}

        <Section label="Recents" people={recents} />
        <Section label="People you follow" people={following} />
        <Section label="People who follow you" people={followers} />

        {empty && (
          <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', padding: `${S[6]}px 0` }}>
            Search for a handle or paste a wallet.
          </div>
        )}

        <button onClick={onClose} style={{ ...btn('secondary', { full: true }), color: 'var(--text-muted)', marginTop: S[5] }}>
          Cancel
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>,
    document.body,
  );
}

type RequestRow = {
  id: string;
  requester_wallet: string;
  payer_wallet: string;
  token: string;
  amount: number;
  note: string | null;
  status: string;
  created_at: string;
  other: { display_name: string | null; avatar_url: string | null } | null;
};

function outgoingStatus(status: string): { style: ReturnType<typeof badge>; label: string } {
  if (status === 'paid') return { style: badge('success'), label: 'Paid' };
  if (status === 'declined') return { style: { ...badge('danger'), background: 'transparent', color: 'var(--text-muted)' }, label: 'Declined' };
  if (status === 'cancelled') return { style: { ...badge('default'), color: 'var(--text-muted)' }, label: 'Cancelled' };
  return { style: badge('default'), label: 'Pending' };
}
