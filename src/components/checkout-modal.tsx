'use client';

import { useEffect, useState, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { MoovCardForm, MOOV_ENABLED } from '@/components/moov-card-form';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { useTheme } from '@/lib/theme';
import { AddressForm, EMPTY_SHIP_TO, shipToValid, shipToSummary, type ShipTo } from '@/components/address-form';
import { visibleTokens, isSwapToken, tokenDisplay } from '@/lib/payable-tokens';
import { sendSol } from '@/lib/transfer-client';
import { t, price } from '@/lib/ui';
import { useCurrency, formatCurrency, type Currency as PrefCurrency } from '@/lib/currency';

const C = {
  navy: 'var(--bg-0)', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: 'var(--ok)', red: 'var(--danger)', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET!;
const RPC      = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
// 12b B2b — Coinbase Commerce, a SECOND crypto rail (max compatibility: any wallet/exchange, not just
// Solana) alongside the native SOL/USDC/Li.Fi flow. Flag-dark until Judah sets the Coinbase keys + flips
// this; adds one additional tab and never touches the existing SOL/USDC/Li.Fi/CARD tabs.
const COINBASE_ENABLED = process.env.NEXT_PUBLIC_COINBASE_ENABLED === '1';

// Payable currencies are driven by src/lib/payable-tokens.ts (the gated set only appears once
// NEXT_PUBLIC_MULTICRYPTO_ENABLED is on), so this is a plain symbol string.
type Currency = string;
interface Quote  { amount: number; display: string; rate_source: string; }
interface Quotes { USDC: Quote|null; SOL: Quote|null; ETH: Quote|null; BTC: Quote|null; }

// Mirrors ORDER_KEY in src/components/payment-methods-manager.tsx (not exported there, so the literal
// is repeated here rather than imported — that file is read-only for this change).
const PAYMENT_ORDER_KEY = 'visby-payment-order';

// Maps a payment-order id (see payment-methods-manager.tsx's `methods` builder) to the matching checkout
// tab. 'cw:'-prefixed ids are connected EXTERNAL wallets — receive-only today ("Paying from an external
// wallet is coming soon" per that file), so they're not a payable checkout method and are skipped rather
// than mapped to a tab.
function methodIdToCheckoutCurrency(id: string): Currency | null {
  if (id === 'wallet') return 'SOL';
  if (id.startsWith('cw:')) return null;
  if (id.startsWith('pm_')) return 'CARD'; // Stripe payment method id
  return 'ACH'; // remaining ids are linked_bank_accounts rows
}

interface Props {
  itemId: string; itemName: string; priceUsdc: number;
  buyerWallet: string; onClose: () => void; onSuccess: (itemId: string) => void;
  // 'pending' = buying an unminted business serial (POST /api/business/buy-pending, itemId is the
  // pending_serials row id, mint happens at settlement). Only SOL is wired for that endpoint today,
  // so non-SOL tabs are hidden rather than left to fail against an endpoint that doesn't support them.
  mode?: 'item' | 'pending';
  // B4: the seller's preferred display currency, only if the caller already has it in hand (e.g. an
  // item page's item.profiles[owner].preferred_currency). Never fetched here — omitted from the
  // summary when absent, so this is a no-op until a caller threads it through.
  sellerCurrency?: PrefCurrency;
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
function CardPayForm({ priceUsdc, payAmount, clientSecret, onSuccess, onError }: {
  priceUsdc: number; payAmount?: number; clientSecret: string;
  onSuccess: () => void; onError: (msg: string) => void;
}) {
  // The button must promise the ACTUAL charged total (item price + tax when Stripe Tax is on), not the
  // tax-exclusive item price — otherwise the buyer authorizes one number and is charged a higher one.
  const chargeUsd = payAmount ?? priceUsdc;
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
        <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Inter',sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Card details</div>
        <CardElement options={{ style: cardStyle(mode === 'dark'), hidePostalCode: true }} />
      </div>
      <button type="submit" disabled={paying || !stripe}
        style={{ width: '100%', background: paying ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: paying ? 'not-allowed' : 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {paying ? <><Spinner /> Processing…</> : `Pay $${chargeUsd.toFixed(2)}`}
      </button>
    </form>
  );
}

// ── Main modal ─────────────────────────────────────────────────
export default function CheckoutModal({ itemId, itemName, priceUsdc, buyerWallet, onClose, onSuccess, mode = 'item', sellerCurrency }: Props) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();
  // Must match buyerWallet exactly — Privy's live wallets[] can transiently hold a different-address
  // wallet than the persisted buyerWallet right after login (see the wallet-flip note in src/lib/wallet.ts).
  // Signing with a mismatched wallet produces an invalid signature for this tx's feePayer, which the chain
  // rejects — that used to surface as a generic "Payment failed" with no clue why (B2a root cause #1).
  const solWallet = wallets.find((w: any) => w.address === buyerWallet);
  const isPending = mode === 'pending';
  const { currency: prefCurrency, format: formatPref } = useCurrency();

  // B4: auto-select the buyer's primary payment method from their saved order (localStorage is instant;
  // reconciled against the server copy below). Falls back to the prior default (SOL for pending, else Card)
  // when there's no usable order yet.
  const [currency, setCurrency] = useState<Currency>(() => {
    if (isPending) return 'SOL';
    try {
      const stored = JSON.parse(localStorage.getItem(PAYMENT_ORDER_KEY) || '[]');
      if (Array.isArray(stored)) {
        const visible = new Set(visibleTokens().map(tk => tk.symbol));
        for (const id of stored) {
          if (typeof id !== 'string') continue;
          const c = methodIdToCheckoutCurrency(id);
          if (c && visible.has(c)) return c;
        }
      }
    } catch { /* fall through to default */ }
    return 'CARD';
  });
  // Whether the buyer has picked a tab by hand — once true, the server-order reconciliation effect below
  // must never override their choice.
  const userPickedMethodRef = useRef(false);
  // Compact "Paying with X — Change" row, expands to the tab strip on tap.
  const [methodExpanded, setMethodExpanded] = useState(false);
  const [quotes,   setQuotes]   = useState<Quotes | null>(null);
  const [piSecret, setPiSecret] = useState<string | null>(null);
  const [taxCents, setTaxCents] = useState(0);
  const [status,   setStatus]   = useState<'idle'|'paying'|'done'|'ach_processing'|'coinbase_pending'|'error'>('idle');
  const [achBanks, setAchBanks] = useState<{ fc_account_id: string; institution_name: string | null; last4: string | null }[] | null>(null);
  const [achBank,  setAchBank]  = useState<{ institution_name: string | null; last4: string | null } | null>(null);
  // Coinbase Commerce (gated): the hosted charge URL we opened in a new tab, kept around so the "waiting
  // for confirmation" panel can offer a "Reopen payment page" link if the buyer closed it early.
  const [coinbaseUrl, setCoinbaseUrl] = useState<string | null>(null);
  const [errMsg,   setErrMsg]   = useState('');
  const [swapQuote,   setSwapQuote]   = useState<any | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [solBalance,  setSolBalance]  = useState<number | null>(null);
  // Moov saved cards (gated) — null = not loaded yet, [] = loaded, none on file. showNewCard forces the
  // Card Link Drop back open even when a default exists ("Use a different card").
  const [moovCards,   setMoovCards]   = useState<{ account_id: string; card_id: string; brand: string | null; last4: string | null; is_default: boolean }[] | null>(null);
  const [showNewCard, setShowNewCard] = useState(false);
  // Effective checkout price for THIS buyer = accepted-offer price (if any) else the list price prop.
  // Display/quote convenience only — every rail independently re-resolves + enforces the price server-side.
  const [effPrice,    setEffPrice]    = useState(priceUsdc);

  // Shipping gate: load the buyer's saved address; if none, ask here before they can pay. Whatever is
  // saved here is snapshotted onto the order by createOrder at settlement.
  const [shipTo,      setShipTo]      = useState<ShipTo | null>(null);
  const [shipLoading, setShipLoading] = useState(true);
  const [editingAddr, setEditingAddr] = useState(false);
  const [addrDraft,   setAddrDraft]   = useState<ShipTo>(EMPTY_SHIP_TO);
  const [addrSaving,  setAddrSaving]  = useState(false);
  const [addrErr,     setAddrErr]     = useState('');

  // B4: reconcile the auto-selected tab with the buyer's SERVER-side payment order once it loads — the
  // localStorage read in the currency initializer above is instant but can be stale/empty on a new
  // device. Never overrides a tab the buyer already picked by hand.
  useEffect(() => {
    if (isPending || !buyerWallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch(`/api/payment-methods/order?wallet=${buyerWallet}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const d = await r.json();
        if (cancelled || userPickedMethodRef.current || !Array.isArray(d.order)) return;
        const visible = new Set(visibleTokens().map(tk => tk.symbol));
        for (const id of d.order) {
          if (typeof id !== 'string') continue;
          const c = methodIdToCheckoutCurrency(id);
          if (c && visible.has(c)) { setCurrency(c); break; }
        }
      } catch { /* fail soft — keep the localStorage-derived selection */ }
    })();
    return () => { cancelled = true; };
  }, [buyerWallet, isPending, getAccessToken]);

  // Load price quotes — non-blocking, modal works fine without them. /api/lifi/quote resolves its
  // price off the `items` table, which doesn't have a row yet for a pending (unminted) serial — so
  // pending mode derives the SOL quote itself from the same CoinGecko-backed rate feed the currency
  // store uses, keyed off the priceUsdc prop instead of a DB lookup.
  useEffect(() => {
    if (isPending) {
      fetch('/api/price/rates')
        .then(r => r.json())
        .then((d: { usd?: Record<string, number> }) => {
          const solUsd = d.usd?.SOL;
          if (!solUsd) return;
          const amount = priceUsdc / solUsd;
          setQuotes({
            SOL: { amount, display: `${amount.toFixed(4)} SOL`, rate_source: 'coingecko' },
            USDC: null, ETH: null, BTC: null,
          });
        })
        .catch(() => {});
      return;
    }
    fetch(`/api/lifi/quote?item_id=${itemId}`)
      .then(r => r.json())
      .then(d => { if (d.quotes) setQuotes(d.quotes); })
      .catch(() => {});
  }, [itemId, isPending, priceUsdc]);

  // Resolve the accepted-offer price for this buyer (else list) so every tab shows + sends the right
  // amount. Fails soft to the list-price prop. Skipped in pending mode (no offers on unminted serials).
  useEffect(() => {
    if (isPending || !buyerWallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch('/api/offers/checkout-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ item_id: itemId, buyer_wallet: buyerWallet }),
        });
        const d = await r.json();
        if (!cancelled && typeof d.priceUsd === 'number' && d.priceUsd > 0) setEffPrice(d.priceUsd);
      } catch { /* fail soft to list price */ }
    })();
    return () => { cancelled = true; };
  }, [itemId, buyerWallet, isPending, getAccessToken]);

  // Create PaymentIntent as soon as the card tab is active. Sends the Privy token — the route now
  // authenticates the buyer (offer pricing keys off buyer_wallet), so an unauthed call 401s.
  // Skipped while Moov is the active card rail — CARD renders MoovCardForm/saved-card UI exclusively
  // in that case, so a Stripe PaymentIntent here would be a stray, never-used, never-charged silent
  // fallback (B1: Moov-only CARD tab when the flag is on).
  useEffect(() => {
    if (MOOV_ENABLED || isPending || currency !== 'CARD' || piSecret || !buyerWallet || shipLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch('/api/stripe/payment-intent', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ item_id: itemId, buyer_wallet: buyerWallet }),
        });
        const d = await r.json();
        if (cancelled) return;
        if (d.client_secret) { setPiSecret(d.client_secret); setTaxCents(d.tax_cents ?? 0); }
        else setErrMsg(d.error ?? 'Could not start checkout');
      } catch { if (!cancelled) setErrMsg('Network error — could not load checkout'); }
    })();
    return () => { cancelled = true; };
  }, [currency, itemId, buyerWallet, piSecret, shipLoading, isPending, getAccessToken]);

  // Moov saved cards (gated): loads once when the CARD tab opens so a returning buyer with a card on
  // file sees the one-tap "Pay with {brand} ····{last4}" button instead of the Card Link Drop.
  useEffect(() => {
    if (!MOOV_ENABLED || isPending || currency !== 'CARD' || !buyerWallet || moovCards !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch(`/api/moov/cards?wallet=${buyerWallet}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const d = await r.json();
        if (!cancelled) setMoovCards(Array.isArray(d.cards) ? d.cards : []);
      } catch { if (!cancelled) setMoovCards([]); }
    })();
    return () => { cancelled = true; };
  }, [currency, buyerWallet, isPending, moovCards, getAccessToken]);

  // Check the buyer's SOL balance when the SOL tab opens, so we can warn before a failed tx
  useEffect(() => {
    if (currency !== 'SOL' || !buyerWallet) return;
    fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [buyerWallet] }) })
      .then(r => r.json())
      .then(d => { if (d.result?.value != null) setSolBalance(d.result.value / 1e9); })
      .catch(() => {});
  }, [currency, buyerWallet]);

  // Load the buyer's linked bank accounts when the ACH tab opens, so we can show which bank will be
  // debited (or prompt them to link one).
  useEffect(() => {
    if (currency !== 'ACH' || !buyerWallet || achBanks) return;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch(`/api/bank/list?wallet=${buyerWallet}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        setAchBanks(Array.isArray(d.accounts) ? d.accounts : []);
      } catch { setAchBanks([]); }
    })();
  }, [currency, buyerWallet, achBanks, getAccessToken]);

  // Fetch a real Li.Fi route when a crypto-swap tab opens (ETH/BTC, plus the gated expanded set).
  // Unreachable in pending mode (only the SOL tab is offered) but guarded defensively anyway.
  useEffect(() => {
    if (isPending || !isSwapToken(currency)) return;
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

  // Moov card rail (gated). Called either with a freshly-linked (accountID, cardID) from the Card Link
  // Drop, or a saved card's ids for one-tap reuse — either way the server charges that exact card to the
  // platform wallet, settles via the same fulfill path as Stripe, and saves the card on file on success.
  async function payWithMoov(accountID: string, cardID: string) {
    setStatus('paying'); setErrMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/moov/charge', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ account_id: accountID, item_id: itemId, buyer_wallet: buyerWallet, card_id: cardID }),
      });
      const data = await res.json();
      if (data.ok) { setStatus('done'); onSuccess(itemId); }
      else { setErrMsg(data.error ?? (data.pending ? 'Payment is processing — check your orders shortly.' : 'Payment failed')); setStatus('error'); }
    } catch (err: any) { setErrMsg(err.message ?? 'Payment failed'); setStatus('error'); }
  }

  // ACH bank-debit (4.4, gated). Initiates an async debit from the buyer's linked bank — nothing is
  // minted here; the item transfers later (webhook, on payment_intent.succeeded) once the debit clears.
  async function payWithAch() {
    setStatus('paying'); setErrMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/stripe/ach-payment-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: itemId, buyer_wallet: buyerWallet }),
      });
      const data = await res.json();
      if (data.ok) { setAchBank(data.bank ?? null); setStatus('ach_processing'); }
      else { setErrMsg(data.error ?? 'Could not start the bank payment.'); setStatus('error'); }
    } catch (err: any) { setErrMsg(err.message ?? 'Could not start the bank payment.'); setStatus('error'); }
  }

  // Coinbase Commerce (gated) — a second, max-compatibility crypto rail. Opens Coinbase's hosted charge
  // page in a new tab; nothing settles here. The item transfers later, in /api/coinbase/webhook, once the
  // on-chain payment confirms (mirrors ACH's initiate-here/fulfill-async shape).
  async function payWithCoinbase() {
    setStatus('paying'); setErrMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/coinbase/create-charge', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: itemId, buyer_wallet: buyerWallet }),
      });
      const data = await res.json();
      if (data.ok && data.hosted_url) {
        setCoinbaseUrl(data.hosted_url);
        window.open(data.hosted_url, '_blank', 'noopener,noreferrer');
        setStatus('coinbase_pending');
      } else {
        setErrMsg(data.error ?? 'Could not start crypto checkout'); setStatus('error');
      }
    } catch (err: any) { setErrMsg(err.message ?? 'Could not start crypto checkout'); setStatus('error'); }
  }

  async function payWithSol() {
    if (!quotes?.SOL) return;
    // B2a root cause #1: solWallet is resolved by matching buyerWallet exactly (see the const above) —
    // if Privy's wallets[] hasn't caught up yet, surface that instead of silently no-op'ing the tap.
    if (!solWallet || typeof (solWallet as any).signTransaction !== 'function') {
      setErrMsg('Your Solana wallet isn’t ready yet. Wait a moment and try again.');
      setStatus('error');
      return;
    }
    setStatus('paying');
    setErrMsg('');
    try {
      const solAmount = isPending ? quotes.SOL.amount : (solPay ?? quotes.SOL.amount);
      // B2a root cause #2: use the shared sendSol() (src/lib/transfer-client.ts) instead of the old
      // inline Connection/sendRawTransaction/confirmTransaction(sig,'confirmed') sequence. That deprecated
      // single-arg confirmTransaction overload THROWS on an RPC timeout even after the transfer already
      // landed on-chain — which swallowed a real, successful payment as a generic "Payment failed" and
      // never reached the fetch below to finalize the order. sendSol polls signature status, tolerates a
      // confirmation timeout (the server verifies on-chain independently), and retries the broadcast.
      const signature = await sendSol({ fromWallet: buyerWallet, toWallet: TREASURY, amountSol: solAmount, solWallet });
      // Pending mode mints at settlement, so the id the caller must route to (the new items row) only
      // exists in the response — itemId here is still the pending_serials row id.
      const res  = await fetch(isPending ? '/api/business/buy-pending' : '/api/sol-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPending
          ? { pending_serial_id: itemId, tx_signature: signature, buyer_wallet: buyerWallet, quoted_sol_price: priceUsdc / quotes.SOL.amount }
          : { item_id: itemId, tx_signature: signature, buyer_wallet: buyerWallet, quoted_sol_price: priceUsdc / quotes.SOL.amount }),
      });
      const data = await res.json();
      if (data.ok) { setStatus('done'); onSuccess(isPending ? (data.item_id ?? itemId) : itemId); }
      else { setErrMsg(data.error ?? 'Transfer failed'); setStatus('error'); }
    } catch (err: any) {
      const m = String(err?.message ?? '');
      const lowFunds = /insufficient|prior credit|debit an account|0x1\b/i.test(m);
      const rejected = /reject|denied|declined|cancel/i.test(m);
      setErrMsg(lowFunds
        ? 'Not enough SOL to cover this purchase plus network fees. Tap Add funds, then try again.'
        : rejected
        ? 'Payment was cancelled.'
        : (m || 'Payment failed — please try again.'));
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

  // The SOL quote is priced off the LIST price; scale it by the effective/list ratio so an accepted-offer
  // buyer sends the discounted SOL amount that the (offer-aware) sol-pay rail now expects. Ratio is 1 with
  // no offer or in pending mode, so this is a no-op there.
  const priceRatio = priceUsdc > 0 ? effPrice / priceUsdc : 1;
  const solPay = quotes?.SOL ? quotes.SOL.amount * priceRatio : null;
  const solPayDisplay = solPay != null ? `${solPay.toFixed(4)} SOL` : '…';
  const hasOfferDiscount = effPrice < priceUsdc - 0.005;
  const chargeUsd = effPrice + taxCents / 100;

  // What the buyer pays in network/transfer fees, by method (shipping is always free to the buyer).
  const transferFeeNote =
    currency === 'SOL' ? 'Solana network fee · paid by you'
    : currency === 'COINBASE' ? 'Network fee · paid by you'
    : isSwapToken(currency) ? 'Network + bridge fees included'
    : 'None';
  // buy-pending only supports the SOL/crypto rail today — CARD/USDC/Li.Fi swap all assume an `items`
  // row that doesn't exist yet for a pending serial, so pending mode offers SOL only, no tab strip.
  // Coinbase Commerce (gated) is appended as an ADDITIONAL tab, never replacing the native crypto tabs.
  const tabs: { id: Currency; label: string; soon?: boolean }[] = isPending
    ? [{ id: 'SOL', label: 'SOL' }]
    : [
        ...visibleTokens().map(tok => ({ id: tok.symbol, label: tok.label })),
        ...(COINBASE_ENABLED ? [{ id: 'COINBASE', label: 'More crypto' }] : []),
      ];
  const selectedTabLabel = tabs.find(tb => tb.id === currency)?.label ?? currency;

  // B4 — Apple-Pay-style summary. The headline is always the buyer's PREFERRED display currency; these
  // lines show what's actually being spent on the selected method, ONLY when that differs from the
  // headline. Never mentions USDC unless USDC is literally the paying asset — USDC isn't a selectable
  // preferred currency (see src/lib/currency.ts CURRENCIES), so that guard is automatic below.
  const totalUsd = currency === 'CARD' ? chargeUsd : effPrice;
  const usingText: string | null =
    currency === 'CARD' ? (prefCurrency !== 'USD' ? formatCurrency(chargeUsd, 'USD') : null)
    : currency === 'ACH' ? (prefCurrency !== 'USD' ? formatCurrency(effPrice, 'USD') : null)
    : currency === 'SOL' ? (solPay != null && prefCurrency !== currency ? tokenDisplay('SOL', solPay) : null)
    : currency === 'USDC' ? tokenDisplay('USDC', effPrice)
    : (isSwapToken(currency) && swapQuote && prefCurrency !== currency) ? (swapQuote.from_amount_display as string)
    : null;
  const sellerReceivesText: string | null =
    sellerCurrency && sellerCurrency !== prefCurrency ? formatCurrency(effPrice, sellerCurrency) : null;

  return (
    <div onClick={status === 'done' ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'var(--modal-scrim)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderBottom: 'none', borderRadius: '30px 30px 0 0', padding: '24px 20px 36px', boxShadow: 'var(--glass-shadow)', maxHeight: '92vh', overflowY: 'auto' }}>

        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', fontFamily: "'Inter',sans-serif" }}>Checkout</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontFamily: "'Manrope',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{itemName}</div>
          </div>
          {status !== 'done' && (
            <button onClick={onClose} aria-label="Close" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Price summary — Apple-Pay style: the headline is always the buyer's preferred display
            currency; "Using"/"Seller receives" only appear when they'd say something the headline
            doesn't already. */}
        <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '18px 16px', marginBottom: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>You pay</div>
            <div style={{ ...price('lg'), margin: '2px auto 0' }}>{formatPref(totalUsd)}</div>
            {hasOfferDiscount && (
              <div style={{ ...t('meta'), color: C.green, fontWeight: 700, marginTop: 4 }}>
                Offer accepted · was {formatPref(priceUsdc)}
              </div>
            )}
            {usingText && (
              <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: 4 }}>Using: {usingText}</div>
            )}
            {sellerReceivesText && (
              <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: 2 }}>Seller receives: {sellerReceivesText}</div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>Shipping</span>
            <span style={{ fontSize: 12, color: C.green, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>Free</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>Transfer fee</span>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>{transferFeeNote}</span>
          </div>
          {currency === 'CARD' && taxCents > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>Sales tax</span>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>${(taxCents / 100).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Shipping gate — use the saved address, or ask for one before paying */}
        {status !== 'done' && (
          <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Inter',sans-serif", marginBottom: 8 }}>Ship to</div>
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
                  style={{ background: GH, border: 'none', borderRadius: 14, padding: '12px', fontWeight: 700, fontSize: 14, color: '#fff', cursor: addrSaving ? 'default' : 'pointer', fontFamily: "'Inter',sans-serif", opacity: addrSaving ? 0.7 : 1 }}>
                  {addrSaving ? 'Saving…' : 'Save address'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Payment method — pending mode has only one payable method (a note replaces the picker); item
            mode collapses to a compact "Paying with X — Change" row (B4), which expands into the same
            tab strip as before on tap. */}
        {hasShip && !editingAddr && status !== 'done' && (
          isPending ? (
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Manrope',sans-serif", marginBottom: 20 }}>
              Pay with SOL — the only method available for this item today.
            </div>
          ) : !methodExpanded ? (
            <button onClick={() => setMethodExpanded(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 16px', cursor: 'pointer' }}>
              <span style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 600 }}>Paying with {selectedTabLabel}</span>
              <span style={{ ...t('meta'), color: C.blue, fontWeight: 700 }}>Change</span>
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--glass-bg)', borderRadius: 16, padding: 4 }}>
              {tabs.map(tb => (
                <button key={tb.id} onClick={() => { setCurrency(tb.id); userPickedMethodRef.current = true; setErrMsg(''); setStatus('idle'); setSwapQuote(null); setMethodExpanded(false); }}
                  style={{ flex: 1, position: 'relative', background: currency === tb.id ? 'var(--glass-bg-strong)' : 'none', border: `1px solid ${currency === tb.id ? 'var(--glass-border)' : 'transparent'}`, borderRadius: 12, padding: '9px 4px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", transition: 'all .15s', opacity: tb.soon ? 0.5 : 1 }}>
                  <div style={{ fontSize: 12, fontWeight: currency === tb.id ? 700 : 500, color: currency === tb.id ? 'var(--text-strong)' : 'var(--text-muted)' }}>{tb.label}</div>
                  {tb.soon && <div style={{ position: 'absolute', top: -5, right: -2, fontSize: 7, background: 'var(--glass-bg-strong)', color: C.muted, borderRadius: 4, padding: '1px 4px', fontFamily: "'Inter',sans-serif" }}>SOON</div>}
                </button>
              ))}
            </div>
          )
        )}

        {/* Success */}
        {status === 'done' ? (
          <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}44`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${C.green}20`, border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.green, fontFamily: "'Inter',sans-serif" }}>Purchase complete!</div>
            <div style={{ fontSize: 12, color: C.muted }}>NFT ownership transferred on Solana</div>
          </div>
        ) : status === 'ach_processing' ? (
          <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--glass-bg-strong)', border: `2px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', fontFamily: "'Inter',sans-serif" }}>Bank payment started</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, fontFamily: "'Manrope',sans-serif" }}>
              We&apos;re collecting ${effPrice.toFixed(2)}{achBank?.last4 ? ` from your ${achBank.institution_name ?? 'bank'} ••${achBank.last4}` : ' from your bank'}. Bank transfers take about 1–3 business days to clear — your item transfers to you automatically once it does, and we&apos;ll email you.
            </div>
            <button onClick={onClose} style={{ marginTop: 6, width: '100%', background: GH, border: 'none', borderRadius: 16, padding: '13px 20px', fontWeight: 800, fontSize: 15, color: '#fff', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
              Done
            </button>
          </div>
        ) : status === 'coinbase_pending' ? (
          <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--glass-bg-strong)', border: `2px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', fontFamily: "'Inter',sans-serif" }}>Waiting for payment confirmation</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, fontFamily: "'Manrope',sans-serif" }}>
              Finish paying in the Coinbase tab we opened. Your item transfers to you automatically once the payment confirms on-chain — this usually takes a few minutes, and we&apos;ll email you.
            </div>
            {coinbaseUrl && (
              <a href={coinbaseUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: C.blue, fontFamily: "'Manrope',sans-serif", textDecoration: 'none' }}>
                Reopen payment page
              </a>
            )}
            <button onClick={onClose} style={{ marginTop: 6, width: '100%', background: GH, border: 'none', borderRadius: 16, padding: '13px 20px', fontWeight: 800, fontSize: 15, color: '#fff', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
              Done
            </button>
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
                moovCards === null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: C.muted, fontSize: 13 }}><Spinner />Loading…</div>
                ) : (() => {
                  const defaultCard = moovCards.find(c => c.is_default) ?? moovCards[0] ?? null;
                  if (defaultCard && !showNewCard) {
                    const label = `Pay with ${defaultCard.brand ?? 'card'}${defaultCard.last4 ? ` ····${defaultCard.last4}` : ''}`;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <button onClick={() => payWithMoov(defaultCard.account_id, defaultCard.card_id)} disabled={status === 'paying'}
                          style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                          {status === 'paying' ? <><Spinner />Processing…</> : label}
                        </button>
                        <button onClick={() => setShowNewCard(true)} disabled={status === 'paying'}
                          style={{ background: 'none', border: 'none', color: 'var(--text-strong)', cursor: status === 'paying' ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Manrope',sans-serif", textAlign: 'center' }}>
                          Use a different card
                        </button>
                      </div>
                    );
                  }
                  return <MoovCardForm buyerWallet={buyerWallet} onCardID={payWithMoov} onError={msg => { setErrMsg(msg); setStatus('error'); }} />;
                })()
              ) : piSecret ? (
                // Elements provides Stripe context only — no clientSecret means no Link, no branding
                <Elements stripe={stripePromise}>
                  <CardPayForm
                    priceUsdc={effPrice}
                    payAmount={chargeUsd}
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
                (solBalance != null && solBalance < (solPay ?? quotes.SOL.amount) + 0.002) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6, fontFamily: "'Inter',sans-serif" }}>Not enough SOL</div>
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, fontFamily: "'Manrope',sans-serif" }}>
                        This costs {solPayDisplay} (plus a small network fee), but your wallet holds {solBalance.toFixed(4)} SOL. Add funds to continue — or pay with Card.
                      </div>
                    </div>
                    <a href="/buy-crypto" style={{ width: '100%', background: GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none' }}>
                      Add funds
                    </a>
                  </div>
                ) : (
                  <button onClick={payWithSol} disabled={status === 'paying'}
                    style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    {status === 'paying' ? <><Spinner />Processing…</> : `Pay ${solPayDisplay}`}
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
                        <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Inter',sans-serif" }}>{k}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, paddingTop: 9, borderTop: '1px solid var(--divider)' }}>
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>Seller receives</span>
                      <span style={{ fontSize: 12, color: C.green, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>${effPrice.toFixed(2)} USD</span>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, fontFamily: "'Manrope',sans-serif" }}>
                    {swapQuote.source === 'lifi'
                      ? 'Live rate locked. Your crypto converts on confirm.'
                      : 'Showing a price estimate — the live rate is momentarily unavailable.'}
                  </div>

                  <button onClick={() => settle(currency, swapQuote.from_amount_display)} disabled={status === 'paying'}
                    style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
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
                    <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Inter',sans-serif" }}>You pay</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif" }}>{effPrice.toFixed(2)} USDC</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, paddingTop: 9, borderTop: '1px solid var(--divider)' }}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>Seller receives</span>
                    <span style={{ fontSize: 12, color: C.green, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>${effPrice.toFixed(2)} USD</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, fontFamily: "'Manrope',sans-serif" }}>
                  USDC is pegged 1:1 — no conversion. Settles on confirm (devnet simulation — real SPL transfer on mainnet).
                </div>
                <button onClick={() => settle('USDC', `${effPrice.toFixed(2)} USDC`)} disabled={status === 'paying'}
                  style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  {status === 'paying' ? <><Spinner />Processing…</> : `Pay ${effPrice.toFixed(2)} USDC`}
                </button>
              </div>
            )}

            {/* ── ACH bank debit (gated) ── */}
            {currency === 'ACH' && (
              achBanks === null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: C.muted, fontSize: 13 }}><Spinner />Loading your banks…</div>
              ) : achBanks.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6, fontFamily: "'Inter',sans-serif" }}>Link a bank to pay by transfer</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, fontFamily: "'Manrope',sans-serif" }}>
                      Connect your bank once in your wallet, then pay directly from it. Bank transfers clear in 1–3 business days — or pay instantly with Card.
                    </div>
                  </div>
                  <a href="/profile" style={{ width: '100%', background: GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                    Link a bank account
                  </a>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Inter',sans-serif" }}>Pay from</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif" }}>
                        {(achBanks[0].institution_name ?? 'Bank')}{achBanks[0].last4 ? ` ••${achBanks[0].last4}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, paddingTop: 9, borderTop: '1px solid var(--divider)' }}>
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>Amount</span>
                      <span style={{ fontSize: 12, color: 'var(--text-strong)', fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>${effPrice.toFixed(2)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, fontFamily: "'Manrope',sans-serif" }}>
                    Bank transfers take about 1–3 business days to clear. Your item transfers to you automatically once it does — we&apos;ll email you.
                  </div>
                  <button onClick={payWithAch} disabled={status === 'paying'}
                    style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    {status === 'paying' ? <><Spinner />Starting…</> : `Pay $${effPrice.toFixed(2)} from bank`}
                  </button>
                </div>
              )
            )}

            {/* ── Coinbase Commerce (gated, 12b B2b) — second crypto rail, any wallet/exchange ── */}
            {currency === 'COINBASE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'var(--glass-bg)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Inter',sans-serif" }}>You pay</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif" }}>${effPrice.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, paddingTop: 9, borderTop: '1px solid var(--divider)' }}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter',sans-serif" }}>Seller receives</span>
                    <span style={{ fontSize: 12, color: C.green, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>${effPrice.toFixed(2)} USD</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, fontFamily: "'Manrope',sans-serif" }}>
                  Pay with any wallet or exchange via Coinbase — BTC, ETH, USDC and more. Opens a secure Coinbase payment page in a new tab; your item transfers once the payment confirms on-chain.
                </div>
                <button onClick={payWithCoinbase} disabled={status === 'paying'}
                  style={{ width: '100%', background: status === 'paying' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: status === 'paying' ? 'not-allowed' : 'pointer', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  {status === 'paying' ? <><Spinner />Starting…</> : `Pay $${effPrice.toFixed(2)} with Coinbase`}
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
