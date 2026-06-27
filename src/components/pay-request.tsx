'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { trpc } from '@/lib/trpc/client';
import { sendSol } from '@/lib/transfer-client';
import { t, S, surface, btn, badge, avatar } from '@/lib/ui';

type Mode = 'pay' | 'request';
type Step = 'idle' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error';

function shortWallet(w: string) {
  return w && w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || '');
}

function Spinner() {
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', opacity: .7, animation: 'spin .8s linear infinite', flexShrink: 0 }} />;
}

function initial(name?: string | null, fallback = 'V') {
  return (name || fallback).slice(0, 1).toUpperCase();
}

export default function PayRequest({ wallet, onDone }: { wallet: string; onDone?: () => void }) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();

  const [mode, setMode] = useState<Mode>('pay');
  const [recipientInput, setRecipientInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const idemRef = useRef<string | null>(null);
  // When a Pay is launched from an incoming request, hold its id + the requester's wallet, so a confirm
  // only closes the request if the money actually went to THAT wallet (the user may have edited it).
  const fulfilling = useRef<{ id: string; wallet: string } | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);

  const requestsQ = trpc.transfers.requests.useQuery({ wallet }, { enabled: !!wallet });
  const connectionsQ = trpc.follows.getConnections.useQuery(
    { wallet, type: 'following', viewer_wallet: wallet },
    { enabled: !!wallet },
  );
  const suggestedQ = trpc.follows.getSuggested.useQuery({ wallet }, { enabled: !!wallet });

  useEffect(() => {
    const id = setTimeout(() => setDebounced(recipientInput.trim()), 400);
    return () => clearTimeout(id);
  }, [recipientInput]);

  // Editing recipient/amount starts a NEW transfer: drop the idempotency key and clear stale errors.
  useEffect(() => {
    idemRef.current = null;
    setStep(s => (s === 'error' ? 'idle' : s));
    setErrMsg('');
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
  const hasRecipient = !!recipient;
  const canSubmit = hasRecipient && amountValid && !inFlight;

  const recipientLabel = recipient
    ? (recipient.display_name || recipient.handle || shortWallet(recipient.wallet))
    : '';

  function selectWallet(w: string) {
    setRecipientInput(w);
    setDebounced(w.trim());
  }

  function resetForm() {
    setRecipientInput('');
    setDebounced('');
    setAmount('');
    setNote('');
    setStep('idle');
    setErrMsg('');
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
      const token = await getAccessToken();
      const res = await fetch('/api/transfer/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ from_wallet: wallet, to: recipientInput.trim(), token: 'SOL', amount: amountNum, idempotency_key: idem }),
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
      signature = await sendSol({ fromWallet: wallet, toWallet, amountSol: amountNum, solWallet });
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
        body: JSON.stringify({ transfer_id: transferId, from_wallet: wallet, tx_hash: signature }),
      });
    } catch {
      // The on-chain tx already landed; a failed confirm only delays the ledger update.
    }

    // Close the request out ONLY if the money actually went to that request's requester.
    const fulfilled = fulfilling.current;
    if (fulfilled && fulfilled.wallet === toWallet) {
      try {
        const token = await getAccessToken();
        await fetch('/api/transfer/request', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ request_id: fulfilled.id, action: 'mark_paid', transfer_id: transferId }),
        });
      } catch {
        // Non-fatal — the request stays pending and can be retried.
      }
    }

    setSuccessMsg(`Sent ${amountNum} SOL to ${recipientLabel}.`);
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
      const token = await getAccessToken();
      const res = await fetch('/api/transfer/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ requester_wallet: wallet, to: recipientInput.trim(), token: 'SOL', amount: amountNum, note: note.trim() || null }),
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
    setSuccessMsg(`Requested ${amountNum} SOL from ${name}.`);
    setStep('done');
    resetForm();
    requestsQ.refetch();
    onDone?.();
  }

  function submit() {
    if (!canSubmit) return;
    if (mode === 'pay') doPay();
    else doRequest();
  }

  function prefillFromIncoming(r: RequestRow) {
    fulfilling.current = { id: r.id, wallet: r.requester_wallet };
    setMode('pay');
    selectWallet(r.requester_wallet);
    setAmount(String(r.amount));
    setSuccessMsg('');
    setStep('idle');
    requestAnimationFrame(() => amountRef.current?.focus());
  }

  async function patchRequest(request_id: string, action: 'decline' | 'cancel') {
    try {
      const token = await getAccessToken();
      await fetch('/api/transfer/request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ request_id, action }),
      });
    } catch {
      // ignore — refetch reflects the true state
    }
    requestsQ.refetch();
  }

  const actionLabel = mode === 'pay' ? 'Pay' : 'Request';
  const buttonLabel =
    step === 'preparing' ? 'Checking…'
      : step === 'signing' ? 'Approve in your wallet…'
        : step === 'confirming' ? 'Confirming…'
          : actionLabel;

  const following = (connectionsQ.data ?? []) as Array<{ wallet: string; display_name: string | null }>;
  const suggested = (suggestedQ.data ?? []) as Array<{ wallet: string; display_name: string | null }>;
  const people = following.length > 0 ? following : suggested;
  const peopleLabel = following.length > 0 ? 'People you follow' : 'Suggested';

  const incoming = (requestsQ.data?.incoming ?? []) as RequestRow[];
  const outgoing = (requestsQ.data?.outgoing ?? []) as RequestRow[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
        {/* Pay | Request toggle */}
        <div style={{ display: 'flex', gap: S[2], marginBottom: S[5] }}>
          <button
            onClick={() => setMode('pay')}
            style={{
              ...btn(mode === 'pay' ? 'primary' : 'secondary', { full: true }),
              ...(mode === 'pay' ? {} : { color: 'var(--text-muted)' }),
            }}
          >
            Pay
          </button>
          <button
            onClick={() => setMode('request')}
            style={{
              ...btn('secondary', { full: true }),
              ...(mode === 'request'
                ? { borderColor: 'var(--text-strong)', color: 'var(--text-strong)' }
                : { color: 'var(--text-muted)' }),
            }}
          >
            Request
          </button>
        </div>

        {/* Amount */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[1], marginBottom: S[5] }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: S[2] }}>
            <input
              ref={amountRef}
              value={amount}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9.]/g, '');
                const parts = raw.split('.');
                setAmount(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw);
              }}
              inputMode="decimal"
              placeholder="0"
              disabled={inFlight}
              style={{
                width: '100%', maxWidth: 220, textAlign: 'center', border: 'none',
                outline: 'none', fontFamily: "'Manrope',sans-serif", fontSize: 48, fontWeight: 800, lineHeight: 1.1,
                letterSpacing: '-0.02em',
                background: amount ? 'var(--grad-brand-text)' : 'transparent',
                WebkitBackgroundClip: amount ? 'text' : undefined,
                backgroundClip: amount ? 'text' : undefined,
                WebkitTextFillColor: amount ? 'transparent' : undefined,
                color: amount ? undefined : 'var(--text-muted)',
              } as any}
            />
          </div>
          <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>SOL</div>
        </div>

        {/* Recommended people */}
        {people.length > 0 && (
          <div style={{ marginBottom: S[4] }}>
            <div style={{ ...t('micro'), color: 'var(--text-muted)', marginBottom: S[2] }}>{peopleLabel}</div>
            <div style={{ display: 'flex', gap: S[3], overflowX: 'auto', paddingBottom: S[1], WebkitOverflowScrolling: 'touch' }}>
              {people.slice(0, 8).map(p => {
                const selected = recipient?.wallet === p.wallet || debounced === p.wallet;
                return (
                  <button
                    key={p.wallet}
                    onClick={() => selectWallet(p.wallet)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[1], width: 60, flexShrink: 0 }}
                  >
                    <div style={{ ...avatar('md'), background: 'var(--grad-brand)', boxShadow: selected ? '0 0 0 2px var(--text-strong)' : 'none' }}>
                      {initial(p.display_name)}
                    </div>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {p.display_name || shortWallet(p.wallet)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recipient search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div>
            <input
              value={recipientInput}
              onChange={e => setRecipientInput(e.target.value)}
              placeholder={mode === 'pay' ? 'Pay to — handle or wallet' : 'Request from — handle or wallet'}
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
                        {initial(recipient.display_name || recipient.handle, 'S')}
                      </div>
                    )}
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                      <span style={{ ...t('body'), color: 'var(--text-strong)' }}>{recipientLabel}</span>
                      <span style={{ ...t('micro'), color: 'var(--text-muted)', fontFamily: 'monospace', textTransform: 'none', letterSpacing: 0 }}>{shortWallet(recipient.wallet)}</span>
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

          {/* Note */}
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What's it for?"
            disabled={inFlight}
            style={{
              width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)',
              borderRadius: 'var(--r-sm)', padding: '13px 16px', color: 'var(--text)', fontSize: 15,
              fontFamily: "'Manrope',sans-serif", outline: 'none',
            }}
          />

          {successMsg && step === 'done' && (
            <div style={{ background: 'var(--ok-soft)', borderRadius: 'var(--r-sm)', padding: '10px 14px', ...t('body'), color: 'var(--ok)' }}>
              {successMsg}
            </div>
          )}

          {errMsg && (
            <div style={{ background: 'var(--danger-soft)', borderRadius: 'var(--r-sm)', padding: '10px 14px', ...t('body'), color: 'var(--danger)' }}>
              {errMsg}
            </div>
          )}

          <button onClick={submit} disabled={!canSubmit} style={{ ...btn('primary', { full: true }), opacity: canSubmit ? 1 : .55, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {inFlight ? <><Spinner /> {buttonLabel}</> : buttonLabel}
          </button>
        </div>
      </div>

      {/* Incoming requests — for you to pay */}
      {incoming.length > 0 && (
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
                  <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700, flexShrink: 0 }}>{r.amount} {r.token}</div>
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
      {outgoing.length > 0 && (
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
                    <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>{r.amount} {r.token}</div>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
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
