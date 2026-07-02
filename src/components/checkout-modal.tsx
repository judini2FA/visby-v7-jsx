'use client';

import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { MoovCardForm, MOOV_ENABLED } from '@/components/moov-card-form';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useTheme } from '@/lib/theme';
import { AddressForm, EMPTY_SHIP_TO, shipToValid, shipToSummary, type ShipTo } from '@/components/address-form';
import { visibleTokens, isSwapToken } from '@/lib/payable-tokens';

const C = {
  navy: 'var(--bg-0)', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: 'var(--ok)', red: 'var(--danger)', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET!;
const RPC      = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// Payable currencies are driven by src/lib/payable-tokens.ts (the gated set only appears once
// NEXT_PUBLIC_MULTICRYPTO_ENABLED is on), so this is a plain symbol string.
type Currency = string;
interface Quote  { amount: number; display: string; rate_source: string; }
interface Quotes { USDC: Quote|null; SOL: Quote|null; ETH: Quote|null; BTC: Quote|null; }

interface Props {
  itemId: string; itemName: string; priceUsdc: number;
  buyerWallet: string; onClose: () => void; onSuccess: (itemId: string) => void;
}

// Stripe CardElement renders in an iframe and can't read CSS vars — pass concrete colors per mode.
const cardStyle = (dark: boolean) => ({
  base: {
    color: dark ? '#ECE8F6' : '#1B1730',
    fontSize: '15px',
    fontFamily: "'Manrope', sans-serif",
    fontSmoothing: 'antialiased' as const,
    '::placeholder': { color: dark ? '#9E97B4' : '#6B6480' },
  },
  invalid: { color: 'var(--danger)', iconColor: 'var(--danger)' },
});

// Inherits the parent's text color via currentColor, so it reads on both gradient buttons and glass.
function Spinner() {
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', opacity: .7, animation: 'spin .8s linear infinite', flexShrink: 0 }} />;
}

// ── Embedded card form — uses CardElement (no Link, no email, no branding) ──
function CardPayForm({ priceUsdc, clientSecret, onSuccess, onError }: {
  priceUsdc: number; clientSecret: string;
  onSuccess: () => void; onError: (msg: string) => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const { mode } = useTheme();
  const { getAccessToken } = usePrivy();
  const [paying, setPaying] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    const cardEl = elements.getElement(CardElement);
    if (!cardEl) return;
    setPaying(true);
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardEl },
    });
    if (error) { onError(error.message ?? 'Payment failed'); setPaying(false); return; }
    if (paymentIntent?.status === 'succeeded') {
      const token = await getAccessToken();
      const res  = await fetch('/api/stripe/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ payment_intent_id: paymentIntent.id }),
      });
      const data = await res.json();
      if (data.ok) onSuccess();
      else { onError(data.error ?? 'Transfer failed'); setPaying(false); }
    } else { onError('Payment incomplete'); setPaying(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '15px 16px' }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Quicksand',sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Card details</div>
        <CardElement options={{ style: cardStyle(mode === 'dark'), hidePostalCode: true }} />
      </div>
      <button type="submit" disabled={paying || !stripe}
        style={{ width: '100%', background: paying ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: paying ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {paying ? <><Spinner /> Processing…</> : `Pay $${priceUsdc.toFixed(2)}`}
      </button>
    </form>
  );
}

// ── Main modal ─────────────────────────────────────────────────
export default function CheckoutModal({ itemId, itemName, priceUsdc, buyerWallet, onClose, onSuccess }: Props) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();
  const solWallet   = wallets.find((w: any) => w.walletClientType === 'privy') ?? wallets[0];

  const [currency, setCurrency] = useState<Currency>('CARD');
  const [quotes,   setQuotes]   = useState<Quotes | null>(null);
  const [piSecret, setPiSecret] = useState<string | null>(null);
  const [status,   setStatus]   = useState<'idle'|'paying'|'done'|'error'>('idle');
  const [errMsg,   setErrMsg]   = useState('');
  const [swapQuote,   setSwapQuote]   = useState<any | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [solBalance,  setSolBalance]  = useState<number | null>(null);

  // Shipping gate: load the buyer's saved address; if none, ask here before they can pay. Whatever is
  // saved here is snapshotted onto the order by createOrder at settlement.
  const [shipTo,      setShipTo]      = useState<ShipTo | null>(null);
  const [shipLoading, setShipLoading] = useState(true);
  const [editingAddr, setEditingAddr] = useState(false);
  const [addrDraft,   setAddrDraft]   = useState<ShipTo>(EMPTY_SHIP_TO);
  const [addrSaving,  setAddrSaving]  = useState(false);
  const [addrErr,     setAddrErr]     = useState('');

  // Load price quotes — non-blocking, modal works fine without them
  useEffect(() => {
    fetch(`/api/lifi/quote?item_id=${itemId}`)
      .then(r => r.json())
      .then(d => { if (d.quotes) setQuotes(d.quotes); })
      .catch(() => {});
  }, [itemId]);

  // Create PaymentIntent as soon as the card tab is active
  useEffect(() => {
    if (currency !== 'CARD' || piSecret || !buyerWallet || shipLoading) return;
    fetch('/api/stripe/payment-intent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, buyer_wallet: buyerWallet }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.client_secret) setPiSecret(d.client_secret);
        else setErrMsg(d.error ?? 'Could not start checkout');
      })
      .catch(() => setErrMsg('Network error — could not load checkout'));
  }, [currency, itemId, buyerWallet, piSecret, shipLoading]);

  // Check the buyer's SOL balance when the SOL tab opens, so we can warn before a failed tx
  useEffect(() => {
    if (currency !== 'SOL' || !buyerWallet) return;
    fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [buyerWallet] }) })
      .then(r => r.json())
      .then(d => { if (d.result?.value != null) setSolBalance(d.result.value / 1e9); })
      .catch(() => {});
  }, [currency, buyerWallet]);

  // Fetch a real Li.Fi route when a crypto-swap tab opens (ETH/BTC, plus the gated expanded set)
  useEffect(() => {
    if (!isSwapToken(currency)) return;
    setSwapQuote(null); setSwapLoading(true); setErrMsg('');
    fetch(`/api/lifi/swap-quote?item_id=${itemId}&from=${currency}`)
      .then(r => r.json())
      .then(d => { if (d.error) setErrMsg(d.error); else setSwapQuote(d); })
      .catch(() => setErrMsg('Could not load swap route'))
      .finally(() => setSwapLoading(false));
  }, [currency, itemId]);

  // Load the buyer's saved shipping address; if there's none, open the inline form.
  useEffect(() => {
    if (!buyerWallet) { setShipLoading(false); setEditingAddr(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch(`/api/buyer/ship-to?wallet=${buyerWallet}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (cancelled) return;
        if (d.ship_to && d.ship_to.line1) setShipTo({ ...EMPTY_SHIP_TO, ...d.ship_to });
        else { setEditingAddr(true); setAddrDraft(EMPTY_SHIP_TO); }
      } catch {
        if (!cancelled) setEditingAddr(true);
      } finally {
        if (!cancelled) setShipLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [buyerWallet, getAccessToken]);

  async function settle(fromCurrency: string, fromAmount: string) {
    setStatus('paying'); setErrMsg('');
    try {
      const token = await getAccessToken();
      const res  = await fetch('/api/lifi/swap-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: itemId, buyer_wallet: buyerWallet, from_currency: fromCurrency, from_amount: fromAmount }),
      });
      const data = await res.json();
      if (data.ok) { setStatus('done'); onSuccess(itemId); }
      else { setErrMsg(data.error ?? 'Payment failed'); setStatus('error'); }
    } catch (err: any) { setErrMsg(err.message ?? 'Payment failed'); setStatus('error'); }
  }

  // Moov card rail (gated). The Card Link Drop returns (accountID, cardID); the server charges the card
  // to the platform wallet and settles via the same fulfill path as Stripe.
  async function payWithMoov(accountID: string, _cardID: string) {
    setStatus('paying'); setErrMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/moov/charge', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ account_id: accountID, item_id: itemId, buyer_wallet: buyerWallet }),
      });
      const data = await res.json();
      if (data.ok) { setStatus('done'); onSuccess(itemId); }
      else { setErrMsg(data.error ?? (data.pending ? 'Payment is processing — check your orders shortly.' : 'Payment failed')); setStatus('error'); }
    } catch (err: any) { setErrMsg(err.message ?? 'Payment failed'); setStatus('error'); }
  }

  async function payWithSol() {
    if (!solWallet || !quotes?.SOL) return;
    setStatus('paying');
    setErrMsg('');
    try {
      const lamports   = Math.round(quotes.SOL.amount * LAMPORTS_PER_SOL);
      const connection = new Connection(RPC, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(buyerWallet);
      tx.add(SystemProgram.transfer({ fromPubkey: new PublicKey(buyerWallet), toPubkey: new PublicKey(TREASURY), lamports }));
      const signed    = await (solWallet as any).signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, 'confirmed');
      const res  = await fetch('/api/sol-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, tx_signature: signature, buyer_wallet: buyerWallet, quoted_sol_price: priceUsdc / quotes.SOL.amount }),
      });
      const data = await res.json();
      if (data.ok) { setStatus('done'); onSuccess(itemId); }
      else { setErrMsg(data.error ?? 'Transfer failed'); setStatus('error'); }
    } catch (err: any) {
      const m = String(err?.message ?? '');
      const lowFunds = /insufficient|prior credit|debit an account|0x1\b/i.test(m);
      setErrMsg(lowFunds
        ? 'Not enough SOL to cover this purchase plus network fees. Tap Add funds, then try again.'
        : (m || 'Payment failed'));
      setStatus('error');
    }
  }

  const hasShip = !!(shipTo && shipTo.line1);

  async function saveAddr() {
    if (!shipToValid(addrDraft)) { setAddrErr('Enter street, city, state and ZIP'); return; }
    setAddrSaving(true); setAddrErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/buyer/ship-to', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ buyer_wallet: buyerWallet, ship_to: addrDraft }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not save address');
      setShipTo({ ...addrDraft });
      setEditingAddr(false);
    } catch (e: any) {
      setAddrErr(e?.message ?? 'Could not save address');
    } finally {
      setAddrSaving(false);
    }
  }

  const quote = currency === 'SOL' ? quotes?.SOL : currency === 'ETH' ? quotes?.ETH : quotes?.USDC;

  // What the buyer pays in network/transfer fees, by method (shipping is always free to the buyer).
  const transferFeeNote =
    currency === 'SOL' ? 'Solana network fee · paid by you'
    : isSwapToken(currency) ? 'Network + bridge fees included'
    : 'None';
  const tabs: { id: Currency; label: string; soon?: boolean }[] =
    visibleTokens().map(t => ({ id: t.symbol, label: t.label }));

  return (
    <div onClick={status === 'done' ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'var(--modal-scrim)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderBottom: 'none', borderRadius: '30px 30px 0 0', padding: '24px 20px 36px', boxShadow: 'var(--glass-shadow)', maxHeight: '92vh', overflowY: 'auto' }}>

        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', fontFamily: "'Quicksand',sans-serif" }}>Checkout</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontFamily: "'Manrope',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{itemName}</div>
          </div>
          {status !== 'done' && (
            <button onClick={onClose} aria-label="Close" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Price summary */}
        <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>You pay</span>
            <span style={{ fontSize: 22, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: "'Quicksand',sans-serif" }}>
              {currency === 'CARD' || currency === 'USDC'
                ? `$${priceUsdc.toFixed(2)}`
                : isSwapToken(currency)
                  ? (swapQuote?.from_amount_display ?? '…')
                  : quote?.display ?? '…'}
            </span>
          </div>
          {currency === 'SOL' && quote && (
            <div style={{ fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 3, fontFamily: "'Quicksand',sans-serif" }}>
              ≈ ${priceUsdc.toFixed(2)} USD
            </div>
          )}
          {isSwapToken(currency) && swapQuote && (
            <div style={{ fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 3, fontFamily: "'Quicksand',sans-serif" }}>
              ≈ ${priceUsdc.toFixed(2)} USD
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>Shipping</span>
            <span style={{ fontSize: 12, color: C.green, fontWeight: 700, fontFamily: "'Quicksand',sans-serif" }}>Free</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>Transfer fee</span>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>{transferFeeNote}</span>
          </div>
        </div>

        {/* Shipping gate — use the saved address, or ask for one before paying */}
        {status !== 'done' && (
          <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Quicksand',sans-serif", marginBottom: 8 }}>Ship to</div>
            {shipLoading ? (
              <div style={{ fontSize: 13, color: C.muted }}>Loading…</div>
            ) : (hasShip && !editingAddr) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontFamily: "'Manrope',sans-serif", lineHeight: 1.4 }}>{shipToSummary(shipTo)}</div>
                <button onClick={() => { setAddrDraft(shipTo ?? EMPTY_SHIP_TO); setEditingAddr(true); setAddrErr(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-strong)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'Manrope',sans-serif", flexShrink: 0 }}>
                  Change
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {!hasShip && <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Manrope',sans-serif" }}>Enter where your item should ship — we&apos;ll save it for next time.</div>}
                <AddressForm value={addrDraft} onChange={setAddrDraft} />
                {addrErr && <div style={{ fontSize: 12, color: C.red }}>{addrErr}</div>}
                <button onClick={saveAddr} disabled={addrSaving}
                  style={{ background: GH, border: 'none', borderRadius: 14, padding: '12px', fontWeight: 700, fontSize: 14, color: '#fff', cursor: addrSaving ? 'default' : 'pointer', fontFamily: "'Quicksand',sans-serif", opacity: addrSaving ? 0.7 : 1 }}>
                  {addrSaving ? 'Saving…' : 'Save address'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        {hasShip && !editingAddr && status !== 'done' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--glass-bg)', borderRadius: 16, padding: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setCurrency(t.id); setErrMsg(''); setStatus('idle'); setSwapQuote(null); }}
              style={{ flex: 1, position: 'relative', background: currency === t.id ? 'var(--glass-bg-strong)' : 'none', border: `1px solid ${currency === t.id ? 'var(--glass-border)' : 'transparent'}`, borderRadius: 12, padding: '9px 4px', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", transition: 'all .15s', opacity: t.soon ? 0.5 : 1 }}>
              <div style={{ fontSize: 12, fontWeight: currency === t.id ? 700 : 500, color: currency === t.id ? 'var(--text-strong)' : 'var(--text-muted)' }}>{t.label}</div>
              {t.soon && <div style={{ position: 'absolute', top: -5, right: -2, fontSize: 7, background: 'var(--glass-bg-strong)', color: C.muted, borderRadius: 4, padding: '1px 4px', fontFamily: "'Quicksand',sans-serif" }}>SOON</div>}
            </button>
          ))}
        </div>
        )}

        {/* Success */}
        {status === 'done' ? (
          <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}44`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${C.green}20`, border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.green, fontFamily: "'Quicksand',sans-serif" }}>Purchase complete!</div>
            <div style={{ fontSize: 12, color: C.muted }}>NFT ownership transferred on Solana</div>
          </div>
        ) : (hasShip && !editingAddr) ? (
          <>
            {errMsg && (
              <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.red, marginBottom: 16 }}>
                {errMsg}
              </div>
            )}

            {/* ── CARD TAB ── */}
            {currency === 'CARD' && (
              MOOV_ENABLED ? (
                <MoovCardForm onCardID={payWithMoov} onError={msg => { setErrMsg(msg); setStatus('error'); }} />
              ) : piSecret ? (
                // Elements provides Stripe context only — no clientSecret means no Link, no branding
                <Elements stripe={stripePromise}>
                  <CardPayForm
                    priceUsdc={priceUsdc}
                    clientSecret={piSecret}
                    onSuccess={() => { setStatus('done'); onSuccess(itemId); }}
                    onError={msg => { setErrMsg(msg); setStatus('error'); }}
                  />
                </Elements>
              ) : errMsg ? null : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: C.muted, fontSize: 13 }}>
                  <Spinner /> Loading…
                </div>
              )
            )}

            {/* ── SOL TAB ── */}
            {currency === 'SOL' && (
              quotes?.SOL ? (
                (solBalance != null && solBalance < quotes.SOL.amount + 0.002) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6, fontFamily: "'Quicksand',sans-serif" }}>Not enough SOL</div>
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, fontFamily: "'Manrope',sans-serif" }}>
                        This costs {quotes.SOL.display} (plus a small network fee), but your wallet holds {solBalance.toFixed(4)} SOL. Add funds to continue — or pay with Card.
                      </div>
                    </div>
                    <a href="/buy-crypto" style={{ width: '100%', background: GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none' }}>
                      Add funds
                    </a>
                  </div>
                ) : (
                  <button onClick={payWithSol} disabled={status === 'paying'}
                    style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    {status === 'paying' ? <><Spinner />Processing…</> : `Pay ${quotes.SOL.display}`}
                  </button>
                )
              ) : <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: C.muted, fontSize: 13 }}><Spinner />Loading SOL quote…</div>
            )}

            {/* ── Li.Fi swap tokens (ETH / BTC + gated expanded set) ── */}
            {isSwapToken(currency) && (
              swapLoading || !swapQuote ? (
                !errMsg && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: C.muted, fontSize: 13 }}><Spinner />Finding the best route…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[
                      ['Route',          swapQuote.source === 'lifi' ? 'Best rate' : 'Price estimate'],
                      ['You pay',        swapQuote.from_amount_display],
                      ['Swaps to',       swapQuote.usdc_out_display],
                      ['Network fee',    swapQuote.gas_usd > 0 ? `≈ $${swapQuote.gas_usd.toFixed(2)}` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>{k}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, paddingTop: 9, borderTop: '1px solid var(--divider)' }}>
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>Seller receives</span>
                      <span style={{ fontSize: 12, color: C.green, fontWeight: 600, fontFamily: "'Quicksand',sans-serif" }}>${priceUsdc.toFixed(2)} USD</span>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, fontFamily: "'Manrope',sans-serif" }}>
                    {swapQuote.source === 'lifi'
                      ? 'Live rate locked. Your crypto converts on confirm.'
                      : 'Showing a price estimate — the live rate is momentarily unavailable.'}
                  </div>

                  <button onClick={() => settle(currency, swapQuote.from_amount_display)} disabled={status === 'paying'}
                    style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    {status === 'paying' ? <><Spinner />Confirming swap…</> : `Confirm swap · ${swapQuote.from_amount_display}`}
                  </button>
                </div>
              )
            )}

            {/* ── USDC (1:1 stablecoin) ── */}
            {currency === 'USDC' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>You pay</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif" }}>{priceUsdc.toFixed(2)} USDC</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, paddingTop: 9, borderTop: '1px solid var(--divider)' }}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>Seller receives</span>
                    <span style={{ fontSize: 12, color: C.green, fontWeight: 600, fontFamily: "'Quicksand',sans-serif" }}>${priceUsdc.toFixed(2)} USD</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, fontFamily: "'Manrope',sans-serif" }}>
                  USDC is pegged 1:1 — no conversion. Settles on confirm (devnet simulation — real SPL transfer on mainnet).
                </div>
                <button onClick={() => settle('USDC', `${priceUsdc.toFixed(2)} USDC`)} disabled={status === 'paying'}
                  style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  {status === 'paying' ? <><Spinner />Processing…</> : `Pay ${priceUsdc.toFixed(2)} USDC`}
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
