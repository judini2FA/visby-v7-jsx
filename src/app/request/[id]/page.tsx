'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { useVisbWallet } from '@/lib/wallet';
import { trpc } from '@/lib/trpc/client';
import { sendSol, sendUsdc, TransferUnconfirmedError } from '@/lib/transfer-client';
import { createStepUpProof, stepUpHeader, STEP_UP_ON } from '@/lib/step-up-client';
import { sendMoneyAction } from '@/lib/step-up-shared';
import { useCurrency } from '@/lib/currency';
import { biometricConfirm, biometricAvailable } from '@/lib/app-lock';
import { explorerTx } from '@/lib/explorer';
import { EmptyState } from '@/components/empty-state';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, card, surface, btn, badge, avatar, price } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

type Step = 'idle' | 'preparing' | 'signing' | 'confirming' | 'error';
type Pending = { transferId: string; toWallet: string; signature: string };

function shortWallet(w: string) {
  return w && w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || '');
}
function initial(name?: string | null, fallback = 'V') {
  return (name || fallback).slice(0, 1).toUpperCase();
}
// A token amount → its USDC (≈ USD) value, ready for format(). SOL needs the live price; if it isn't
// loaded the caller falls back to showing the raw token amount.
function tokenUsdc(amount: number, token: string, solUsd: number | null): number | null {
  if (token === 'USDC') return amount;
  return solUsd ? amount * solUsd : null;
}

function Spinner({ size = 16 }: { size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', opacity: .7, animation: 'spin .8s linear infinite', flexShrink: 0 }} />;
}

function FullScreenSpinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--glass-border)', borderTopColor: 'var(--text-muted)', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${S[6]}px ${S[4]}px` }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50 }}>
        <HeaderMenu />
      </div>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: S[5] }}>
        {children}
      </div>
    </div>
  );
}

const ReceiptIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2Z" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" />
  </svg>
);
const LockIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const BanIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
  </svg>
);
const CheckIcon = ({ color = 'currentColor', size = 32 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const XIcon = ({ color = 'currentColor', size = 32 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const ClockIcon = ({ color = 'currentColor', size = 32 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const ExternalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export default function PaymentRequestPage() {
  const { id } = useParams() as { id: string };
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { address: wallet, ready: walletReady } = useVisbWallet();
  const { format } = useCurrency();

  const q = trpc.transfers.byId.useQuery({ id }, { enabled: ready && authenticated && !!id, retry: false });

  const [step, setStep] = useState<Step>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [declineBusy, setDeclineBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const idemRef = useRef<string | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  // A signed+broadcast tx must never be forgotten on a reload — that's what invites a second, genuinely
  // duplicate send. Mirror pendingRef into sessionStorage (keyed per request) so a refresh after a slow
  // devnet confirm restores it and doAccept() takes the retry-only path instead of re-signing.
  const pendingKey = `visby-pay-pending:${id}`;
  function setPending(p: Pending | null) {
    pendingRef.current = p;
    try {
      if (p) sessionStorage.setItem(pendingKey, JSON.stringify(p));
      else sessionStorage.removeItem(pendingKey);
    } catch { /* sessionStorage unavailable — best-effort only */ }
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(pendingKey);
      if (raw) pendingRef.current = JSON.parse(raw);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const inFlight = step === 'preparing' || step === 'signing' || step === 'confirming';
  const scanReady = biometricAvailable();

  async function patchAction(action: 'decline' | 'cancel') {
    const authToken = await getAccessToken();
    return fetch('/api/transfer/request', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: JSON.stringify({ request_id: id, action }),
    });
  }

  async function doDecline() {
    const passed = await biometricConfirm();
    if (!passed) return;
    setDeclineBusy(true);
    setErrMsg('');
    try { await patchAction('decline'); } catch { /* refetch reflects the true state */ }
    setDeclineBusy(false);
    q.refetch();
  }

  async function doCancel() {
    const passed = await biometricConfirm();
    if (!passed) return;
    setCancelBusy(true);
    setErrMsg('');
    try { await patchAction('cancel'); } catch { /* refetch reflects the true state */ }
    setCancelBusy(false);
    q.refetch();
  }

  // Ask the server to verify the on-chain tx a few times before giving up — devnet can take longer than
  // one shot to surface a just-landed transaction. Only after this succeeds do we mark the request paid,
  // so a request can never flip to "Paid" without a matching confirmed transfer.
  async function confirmAndMarkPaid(transferId: string, toWallet: string) {
    const pending = pendingRef.current;
    if (!pending) { setErrMsg('Something went wrong — please try again.'); setStep('error'); return; }
    setStep('confirming');

    let confirmedSent = false;
    for (let attempt = 0; attempt < 4 && !confirmedSent; attempt++) {
      if (attempt > 0) await new Promise(res => setTimeout(res, 2500));
      try {
        const authToken = await getAccessToken();
        const cres = await fetch('/api/transfer/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          body: JSON.stringify({ transfer_id: transferId, from_wallet: wallet, tx_hash: pending.signature }),
        });
        const cj = await cres.json().catch(() => ({}));
        confirmedSent = cj?.status === 'sent';
      } catch { /* retry */ }
    }

    if (!confirmedSent) {
      setErrMsg('Payment sent — still confirming on the network. Tap Retry in a moment.');
      setStep('error');
      return;
    }

    let marked = false;
    for (let attempt = 0; attempt < 2 && !marked; attempt++) {
      if (attempt > 0) await new Promise(res => setTimeout(res, 1500));
      try {
        const authToken = await getAccessToken();
        const mres = await fetch('/api/transfer/request', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          body: JSON.stringify({ request_id: id, action: 'mark_paid', transfer_id: transferId }),
        });
        marked = mres.ok;
      } catch { /* retry */ }
    }

    setPending(null);
    idemRef.current = null;
    setStep('idle');
    setErrMsg('');
    q.refetch();
  }

  async function doAccept() {
    if (!wallet || !q.data) return;
    const passed = await biometricConfirm();
    if (!passed) { setErrMsg('Scan cancelled — not sent.'); return; }
    setErrMsg('');

    const r = q.data as any;

    // Already signed + broadcast in an earlier attempt (e.g. a slow devnet confirm) — do NOT re-sign or
    // re-prepare, that would risk a second real transfer. Just re-check confirmation and try again.
    if (pendingRef.current) {
      await confirmAndMarkPaid(pendingRef.current.transferId, pendingRef.current.toWallet);
      return;
    }

    setStep('preparing');
    if (!idemRef.current) idemRef.current = crypto.randomUUID();

    let prep: any;
    try {
      const authToken = await getAccessToken();
      let stepUpHeaders: Record<string, string> = {};
      if (STEP_UP_ON) {
        const signer = wallets.find((w: any) => w.address === wallet);
        if (!signer || typeof (signer as any).signMessage !== 'function') {
          setErrMsg("This wallet can't complete the security check on this device."); setStep('error'); return;
        }
        try {
          const proof = await createStepUpProof({ action: sendMoneyAction(r.requester_wallet, r.token), signMessage: (m: Uint8Array) => (signer as any).signMessage(m) });
          stepUpHeaders = stepUpHeader(proof);
        } catch { setErrMsg('Security check cancelled.'); setStep('error'); return; }
      }
      const res = await fetch('/api/transfer/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...stepUpHeaders },
        body: JSON.stringify({ from_wallet: wallet, to: r.requester_wallet, token: r.token, amount: Number(r.amount), idempotency_key: idemRef.current }),
      });
      prep = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || prep?.error === 'recipient_not_found') setErrMsg("We couldn't find the requester's wallet.");
        else if (prep?.error === 'mfa_required') setErrMsg('Turn on two-factor authentication in Settings to send money.');
        else if (prep?.error === 'step_up_required' || prep?.error === 'step_up_failed') setErrMsg('Security check failed — please try again.');
        else if (res.status === 403 || prep?.error === 'limit_exceeded') setErrMsg(`That's over your send limit (${prep?.reason ?? 'limit'}).`);
        else if (prep?.error === 'account_banned') setErrMsg('Your account is restricted from sending money.');
        else setErrMsg(prep?.error ?? 'Could not start the payment.');
        setStep('error');
        return;
      }
    } catch {
      setErrMsg('Network error — could not start the payment.');
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

    try {
      const signature = r.token === 'USDC'
        ? await sendUsdc({ fromWallet: wallet, toWallet, amountUsdc: Number(r.amount), solWallet })
        : await sendSol({ fromWallet: wallet, toWallet, amountSol: Number(r.amount), solWallet });
      setPending({ transferId, toWallet, signature });
    } catch (err: any) {
      if (err instanceof TransferUnconfirmedError) {
        // It was broadcast — blockhash expiry is a hard on-chain rule, so the original can never land
        // twice. Hold the signature and let the confirm step (with its own retries) settle it.
        setPending({ transferId, toWallet, signature: err.signature });
      } else {
        const m = String(err?.message ?? '');
        const lowFunds = /insufficient|prior credit|debit an account|0x1\b/i.test(m);
        setErrMsg(lowFunds || !m ? 'Payment failed — check your balance and try again.' : friendlyError(err, 'Payment failed — check your balance and try again.'));
        setStep('error');
        return;
      }
    }

    await confirmAndMarkPaid(transferId, toWallet);
  }

  // ── Render states ──────────────────────────────────────────────
  if (!ready || (authenticated && !walletReady)) return <FullScreenSpinner />;

  if (!authenticated) {
    return (
      <Shell>
        <EmptyState
          icon={<LockIcon />}
          title="Sign in to view this request"
          message="This payment request is waiting for you. Sign in to see who sent it and respond."
          action={{ label: 'Sign In', href: '/login' }}
        />
      </Shell>
    );
  }

  if (q.isLoading) return <FullScreenSpinner />;

  if (q.error) {
    const code = (q.error as any)?.data?.code;
    if (code === 'FORBIDDEN') {
      return (
        <Shell>
          <EmptyState icon={<BanIcon />} title="Not your request" message="This payment request isn't linked to your account." action={{ label: 'Go to Wallet', href: '/wallet?tab=pay' }} />
        </Shell>
      );
    }
    return (
      <Shell>
        <EmptyState icon={<ReceiptIcon />} title="Couldn't load this request" message="Something went wrong loading this payment request." action={{ label: 'Try again', onClick: () => q.refetch() }} />
      </Shell>
    );
  }

  if (!q.data) {
    return (
      <Shell>
        <EmptyState icon={<ReceiptIcon />} title="Request not found" message="This payment request doesn't exist or has been removed." action={{ label: 'Go to Wallet', href: '/wallet?tab=pay' }} />
      </Shell>
    );
  }

  const r = q.data as any;
  const isPayer = r.viewer_role === 'payer';
  const other = isPayer ? r.requester : r.payer;
  const otherWallet: string = isPayer ? r.requester_wallet : r.payer_wallet;
  const otherHref = wallet && otherWallet === wallet ? '/profile' : `/p/${otherWallet}`;
  const otherName = other?.display_name || shortWallet(otherWallet);
  const usd = tokenUsdc(Number(r.amount), r.token, solUsd);
  const pending = pendingRef.current;
  const canRetryOnly = step === 'error' && !!pending;

  const statusMeta: Record<string, { label: string; variant: 'default' | 'success' | 'danger' }> = {
    pending: { label: 'Pending', variant: 'default' },
    paid: { label: 'Paid', variant: 'success' },
    declined: { label: 'Declined', variant: 'danger' },
    cancelled: { label: 'Cancelled', variant: 'default' },
  };
  const sm = statusMeta[r.status] ?? statusMeta.pending;

  const acceptLabel =
    step === 'preparing' ? 'Preparing…'
      : step === 'signing' ? 'Approve in your wallet…'
        : step === 'confirming' ? 'Confirming…'
          : canRetryOnly ? 'Retry'
            : (scanReady ? 'Scan to pay' : 'Accept & Pay');

  return (
    <Shell>
      <div style={{ ...card({ pad: S[6] }), display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {other?.avatar_url ? (
          <img src={other.avatar_url} alt="" style={{ ...avatar('lg'), objectFit: 'cover', marginBottom: S[4] }} />
        ) : (
          <div style={{ ...avatar('lg'), background: 'var(--grad-brand)', marginBottom: S[4] }}>{initial(other?.display_name, 'S')}</div>
        )}

        <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[1] }}>
          {isPayer ? 'Payment requested by' : 'Payment requested from'}
        </div>
        <Link href={otherHref} style={{ ...t('heading'), color: 'var(--text-strong)', textDecoration: 'underline', textUnderlineOffset: 2, marginBottom: S[5] }}>
          {otherName}
        </Link>

        <div style={price('lg')}>{usd != null ? format(usd) : `${r.amount} ${r.token}`}</div>
        {usd != null && (
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>{r.amount} {r.token}</div>
        )}

        <div style={{ marginTop: S[4] }}>
          <span style={badge(sm.variant)}>{sm.label}</span>
        </div>

        {r.note && (
          <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), marginTop: S[5], width: '100%', boxSizing: 'border-box' }}>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[1] }}>Note</div>
            <div style={{ ...t('body'), color: 'var(--text)' }}>{r.note}</div>
          </div>
        )}

        {/* ── Pending: payer can accept/decline ── */}
        {r.status === 'pending' && isPayer && (
          <div style={{ width: '100%', marginTop: S[6], display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {errMsg && (
              <div style={{ background: 'var(--danger-soft)', borderRadius: 'var(--r-sm)', padding: '10px 14px', ...t('body'), color: 'var(--danger)' }}>
                {errMsg}
              </div>
            )}
            <button onClick={doAccept} disabled={inFlight} style={{ ...btn('primary', { full: true }), opacity: inFlight ? .7 : 1, cursor: inFlight ? 'default' : 'pointer' }}>
              {inFlight ? <><Spinner /> {acceptLabel}</> : acceptLabel}
            </button>
            {!canRetryOnly && (
              <button onClick={doDecline} disabled={inFlight || declineBusy} style={{ ...btn('secondary', { full: true }), color: 'var(--text-muted)', cursor: (inFlight || declineBusy) ? 'default' : 'pointer' }}>
                {declineBusy ? <><Spinner /> Declining…</> : 'Decline'}
              </button>
            )}
          </div>
        )}

        {/* ── Pending: requester is just watching, can cancel ── */}
        {r.status === 'pending' && !isPayer && (
          <div style={{ width: '100%', marginTop: S[6], display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: S[2], color: 'var(--text-muted)' }}>
              <ClockIcon size={15} /> <span style={t('meta')}>Waiting for {otherName} to pay</span>
            </div>
            <button onClick={doCancel} disabled={cancelBusy} style={{ ...btn('secondary', { full: true }), color: 'var(--text-muted)', cursor: cancelBusy ? 'default' : 'pointer' }}>
              {cancelBusy ? <><Spinner /> Cancelling…</> : 'Cancel request'}
            </button>
          </div>
        )}

        {/* ── Paid: receipt ── */}
        {r.status === 'paid' && (
          <div style={{ width: '100%', marginTop: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3] }}>
            <div style={{ ...surface({ radius: '50%' }), width: 56, height: 56, background: 'var(--ok-soft)', border: '1px solid var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckIcon color="var(--ok)" size={26} />
            </div>
            <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
              {isPayer ? `You paid ${otherName}.` : `${otherName} paid you.`}
            </div>
            {r.tx_hash && (
              <a href={explorerTx(r.tx_hash)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: S[2], ...t('meta'), color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                View transaction <ExternalIcon />
              </a>
            )}
          </div>
        )}

        {/* ── Declined / cancelled: terminal, view-only ── */}
        {(r.status === 'declined' || r.status === 'cancelled') && (
          <div style={{ width: '100%', marginTop: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3] }}>
            <div style={{ ...surface({ radius: '50%' }), width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XIcon color="var(--text-muted)" size={22} />
            </div>
            <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
              {r.status === 'declined'
                ? (isPayer ? 'You declined this request.' : `${otherName} declined this request.`)
                : (isPayer ? `${otherName} cancelled this request.` : 'You cancelled this request.')}
            </div>
          </div>
        )}
      </div>

      <Link href="/wallet?tab=pay" style={{ ...btn('secondary', { full: true }) }}>
        Back to Wallet
      </Link>
    </Shell>
  );
}
