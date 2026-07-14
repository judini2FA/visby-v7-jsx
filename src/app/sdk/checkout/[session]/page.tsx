'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useSolanaWallets as useSolanaSigner } from '@privy-io/react-auth/solana';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useVisbWallet } from '@/lib/wallet';
import { useTheme } from '@/lib/theme';
import { useCurrency } from '@/lib/currency';
import { type PayMethod } from '@/lib/payment-pref';
import { t, S, card, surface, btn, badge, sectionLabel, price } from '@/lib/ui';

const GREEN = 'var(--ok)';
const RED   = 'var(--danger)';
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET!;
const RPC = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
// Estimated bank/FX conversion cost shown in the buyer's preferred currency. Not a Visby charge —
// the card is charged the exact USD total; this previews real-world local cost and is labelled "est."
const XFER_FEE = 0.025;
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Session {
  session_id: string;
  status: 'pending' | 'paid' | 'minted' | 'failed' | 'cancelled';
  merchant_name: string;
  product_name: string;
  serial_number: string | null;
  price_usdc: number;
  currency: string;
  success_url: string | null;
  cancel_url: string | null;
}

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
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
  invalid: { color: RED, iconColor: RED },
});

function Spinner({ size = 16 }: { size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.7, animation: 'spin .8s linear infinite', flexShrink: 0 }} />;
}

function ShieldIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function WalletGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="13" rx="3" /><path d="M16 12.5h.02M2.5 10.5h19" />
    </svg>
  );
}

function LockGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// The flashy "how Visby works + why" walkthrough shown when a signed-out buyer taps Create account.
const LEARN_SLIDES = [
  { icon: <ShieldIcon size={28} />, title: 'Own the proof, not just the product', body: 'Every Visby purchase mints you an Authenticity NFT — a chain-verified certificate that your exact item is genuine. Yours forever, impossible to fake.' },
  { icon: <WalletGlyph size={26} />, title: 'No cards. No seed phrases.', body: 'Sign in with just your email. Visby spins up a secure wallet for you and remembers your default payment, so checkout is a single tap next time.' },
  { icon: <LockGlyph size={26} />, title: 'Protected end to end', body: 'Your payment is held safely until the seller ships, and the full ownership history stays verifiable on-chain. Buy with confidence.' },
];

function SignedOutFlow({ login }: { login: () => void }) {
  const [step, setStep] = useState(0); // 0 = choose, 1..N = walkthrough slides
  const total = LEARN_SLIDES.length;

  if (step === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>Check out with Visby</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>New here? See how it works — or log in to pay.</div>
        </div>
        <button onClick={() => setStep(1)} style={{ ...btn('primary', { full: true }) }}>Create a Visby account</button>
        <button onClick={login} style={{ ...btn('secondary', { full: true }) }}>Log in</button>
      </div>
    );
  }

  const slide = LEARN_SLIDES[step - 1];
  const isLast = step === total;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div key={step} style={{ ...surface({ pad: `${S[6]}px ${S[5]}px` }), textAlign: 'center', animation: 'slidein .35s cubic-bezier(.2,.8,.2,1)' }}>
        <div style={{ width: 68, height: 68, margin: `0 auto ${S[4]}px`, borderRadius: '50%', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 10px 28px rgba(120,110,160,.38)' }}>
          {slide.icon}
        </div>
        <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[2] }}>{slide.title}</div>
        <div style={{ ...t('body'), color: 'var(--text-muted)' }}>{slide.body}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: S[2] }}>
        {LEARN_SLIDES.map((_, i) => (
          <span key={i} style={{ width: i === step - 1 ? 22 : 7, height: 7, borderRadius: 99, background: i === step - 1 ? 'var(--grad-brand)' : 'var(--divider)', transition: 'width .3s, background .3s' }} />
        ))}
      </div>

      <button onClick={() => (isLast ? login() : setStep(step + 1))} style={{ ...btn('primary', { full: true }) }}>
        {isLast ? 'Create my account' : 'Next'}
      </button>
      <button onClick={() => setStep(step - 1)} style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
        Back
      </button>
    </div>
  );
}

function CardGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" />
    </svg>
  );
}

// The one-tap pay panel for a signed-in buyer. Mirrors the default payment method they set in the Visby
// app: 'wallet' shows their Visby balance, 'card' shows their saved card as •••• last4. Always surfaces
// the final price after transfer fees.
function DefaultPayPanel({ method, priceUsdc, currency, format, last4, balance, onPay, onUseAnother }: {
  method: PayMethod;
  priceUsdc: number;
  currency: string;
  format: (n: number) => string;
  last4?: string;
  balance?: string;
  onPay: () => void;
  onUseAnother: () => void;
}) {
  const finalUsd = `$${priceUsdc.toFixed(2)}`;
  const finalNote = currency !== 'USD'
    ? `≈ ${format(priceUsdc * (1 + XFER_FEE))} ${currency} · final, incl. transfer fees`
    : 'final price, incl. transfer fees';

  const chip = (icon: React.ReactNode) => (
    <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>{icon}</span>
  );

  if (method === 'wallet') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: S[3], ...t('body'), color: 'var(--text-strong)', fontWeight: 600 }}>
            {chip(<WalletGlyph size={18} />)} Visby balance
          </span>
          <span style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {balance != null ? `$${balance}` : '—'}
          </span>
        </div>
        <button onClick={onPay} style={{ ...btn('primary', { full: true }) }}>Pay {finalUsd} from balance</button>
        <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center' }}>{finalNote}</div>
        <button onClick={onUseAnother} style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Use a card instead</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: S[3], ...t('body'), color: 'var(--text-strong)', fontWeight: 600 }}>
          {chip(<CardGlyph size={18} />)} Visby ···· {last4 || '····'}
        </span>
        <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>Default</span>
      </div>
      <button onClick={onPay} style={{ ...btn('primary', { full: true }) }}>Pay {finalUsd}</button>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center' }}>{finalNote}</div>
      <button onClick={onUseAnother} style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Pay another way</button>
    </div>
  );
}

// Embedded card form — CardElement only (no Link, no email, no branding), mirrors checkout-modal.
function CardPayForm({ priceUsdc, clientSecret, onSuccess, onError }: {
  priceUsdc: number; clientSecret: string;
  onSuccess: (paymentIntentId: string) => void; onError: (msg: string) => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const { mode }  = useTheme();
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
      onSuccess(paymentIntent.id);
    } else {
      onError('Payment incomplete'); setPaying(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div style={{ ...surface({ pad: `${S[4]}px ${S[4]}px` }) }}>
        <div style={{ ...sectionLabel(), marginBottom: S[3] }}>Card details</div>
        <CardElement options={{ style: cardStyle(mode === 'dark'), hidePostalCode: true }} />
      </div>
      <button type="submit" disabled={paying || !stripe}
        style={{ ...btn('primary', { full: true }), opacity: paying || !stripe ? 0.7 : 1, cursor: paying ? 'not-allowed' : 'pointer' }}>
        {paying ? <><Spinner /> Processing…</> : `Pay $${priceUsdc.toFixed(2)}`}
      </button>
    </form>
  );
}

// Crypto-balance one-tap: pay from the buyer's Visby (SOL) balance. Shows the real SOL balance (not a
// dollar figure) and charges the USD total converted to SOL at the current rate.
function CryptoPayPanel({ priceUsdc, solBalance, onPay, onBack }: {
  priceUsdc: number; solBalance: number | null; onPay: () => void; onBack: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: S[3], ...t('body'), color: 'var(--text-strong)', fontWeight: 600 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}><WalletGlyph size={18} /></span>
          Visby crypto balance
        </span>
        <span style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {solBalance != null ? `${solBalance.toFixed(3)} SOL` : '—'}
        </span>
      </div>
      <button onClick={onPay} style={{ ...btn('primary', { full: true }) }}>Pay ${priceUsdc.toFixed(2)} with crypto</button>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center' }}>Paid in SOL at the current rate · Solana network fee applies</div>
      <button onClick={onBack} style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Pay with a card instead</button>
    </div>
  );
}

// Method picker — opened from "Pay another way". Lists the buyer's saved cards (ordered by their favorites),
// their crypto balance, and a new-card option. Picking a card returns to the confirm panel with it selected.
function MethodPicker({ cards, chosenId, hasCrypto, onPickCard, onPickCrypto, onNewCard, onCancel }: {
  cards: { id: string; brand: string; last4: string }[];
  chosenId: string | null;
  hasCrypto: boolean;
  onPickCard: (id: string) => void;
  onPickCrypto: () => void;
  onNewCard: () => void;
  onCancel: () => void;
}) {
  const chip = (icon: React.ReactNode) => (
    <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>{icon}</span>
  );
  const Row = ({ icon, label, sub, selected, onClick }: { icon: React.ReactNode; label: string; sub?: string; selected?: boolean; onClick: () => void }) => (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: S[3], width: '100%', textAlign: 'left', padding: `${S[3]}px ${S[4]}px`, borderRadius: 'var(--r-lg)', border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', boxShadow: selected ? '0 4px 16px rgba(42,138,237,.28)' : 'none', cursor: 'pointer' }}>
      {chip(icon)}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...t('body'), color: 'var(--text-strong)', fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ display: 'block', ...t('meta'), color: 'var(--text-muted)' }}>{sub}</span>}
      </span>
      {selected && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A8AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
    </button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Choose how to pay</div>
      {cards.map(c => (
        <Row key={c.id} icon={<CardGlyph size={18} />} label={`···· ${c.last4}`} sub={c.brand ? c.brand[0].toUpperCase() + c.brand.slice(1) : 'Card'} selected={c.id === chosenId} onClick={() => onPickCard(c.id)} />
      ))}
      {hasCrypto && <Row icon={<WalletGlyph size={18} />} label="Visby crypto balance" sub="Pay in SOL" onClick={onPickCrypto} />}
      <Row icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>} label="Use a new card" onClick={onNewCard} />
      <button onClick={onCancel} style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', background: 'none', border: 0, cursor: 'pointer', padding: `${S[2]}px 0` }}>Cancel</button>
    </div>
  );
}

export default function SdkCheckoutPage() {
  const { session: sessionId } = useParams() as { session: string };
  const { ready: privyReady, authenticated, login, getAccessToken } = usePrivy();
  const { address: buyerWallet, ready: walletReady } = useVisbWallet();
  const { createWallet } = useSolanaWallets();
  const { wallets: solSigners } = useSolanaSigner();
  const solWallet = solSigners.find((w: any) => w.walletClientType === 'privy') ?? solSigners[0];
  const { mode } = useTheme();
  const { currency, format } = useCurrency();

  // One-tap by default (the buyer's saved method); 'pay another way' reveals the manual card form.
  const [showManualCard, setShowManualCard] = useState(false);
  // Demo override so both one-tap variants can be previewed without a funded wallet / saved card on file:
  //   ?last4=4242  →  card variant   ·   ?balance=240.00  →  wallet balance   ·   ?pay=card|wallet renders
  //   the panel in isolation (bypasses the auth/wallet gates) purely for visual review.
  const [demoPay, setDemoPay] = useState<{ last4?: string; balance?: string }>({});
  const [previewPay, setPreviewPay] = useState<PayMethod | null>(null);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const last4 = sp.get('last4') || undefined;
      const balance = sp.get('balance') || undefined;
      if (last4 || balance) setDemoPay({ last4, balance });
      const p = sp.get('pay');
      if (p === 'card' || p === 'wallet') setPreviewPay(p);
    } catch {}
  }, []);

  // A Solana embedded wallet is required to receive the provenance NFT. Privy's default embedded wallet
  // is Ethereum, so for accounts without a Solana wallet we create one here — and surface failures instead
  // of hanging on a spinner forever (e.g. if Solana embedded wallets aren't enabled on the Privy app).
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [walletErr, setWalletErr] = useState('');
  const triedWallet = useRef(false);

  const makeWallet = useCallback(async () => {
    setCreatingWallet(true); setWalletErr('');
    try {
      await createWallet();
    } catch (e: unknown) {
      setWalletErr(
        'We couldn’t finish setting up your Visby wallet. Tap retry — if it keeps failing, the seller needs to enable Solana wallets.'
      );
    } finally {
      setCreatingWallet(false);
    }
  }, [createWallet]);

  useEffect(() => {
    if (authenticated && walletReady && !buyerWallet && !creatingWallet && !walletErr && !triedWallet.current) {
      triedWallet.current = true;
      makeWallet();
    }
  }, [authenticated, walletReady, buyerWallet, creatingWallet, walletErr, makeWallet]);

  const [session, setSession]   = useState<Session | null>(null);
  const [loadErr, setLoadErr]   = useState('');
  const [loading, setLoading]   = useState(true);

  const [piSecret, setPiSecret] = useState<string | null>(null);
  const [piErr, setPiErr]       = useState('');

  const [settling, setSettling]   = useState(false);
  const [payErr, setPayErr]       = useState('');
  const [result, setResult]       = useState<{ order_id: string; nft_address: string; minted: boolean } | null>(null);

  // The buyer's saved cards, ordered by their persisted favorites (index 0 = default). One-tap charges the
  // chosen card; the picker lets them switch card / crypto / a new card. No cards → manual entry.
  const [cards, setCards]               = useState<{ id: string; brand: string; last4: string }[]>([]);
  const [cardsLoaded, setCardsLoaded]   = useState(false);
  const [chosenCardId, setChosenCardId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const chosenCard = cards.find(c => c.id === chosenCardId) ?? cards[0] ?? null;
  const wantManual = showManualCard || (cardsLoaded && cards.length === 0);

  // Crypto-balance pay (SOL from the buyer's Visby wallet) as an alternative to card.
  const [cryptoMode, setCryptoMode] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);

  const loadSession = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const r = await fetch(`/api/sdk/session/${sessionId}`);
      if (r.status === 503) { setLoadErr('Checkout is temporarily unavailable. Please try again shortly.'); return; }
      const d = await r.json();
      if (!r.ok || d.error || !d.session) { setLoadErr(d.error ?? 'This checkout link is invalid or has expired.'); return; }
      setSession(d.session as Session);
    } catch {
      setLoadErr('Could not load this checkout. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { if (sessionId) loadSession(); }, [sessionId, loadSession]);

  // Load the buyer's saved cards, ordered by their persisted favorites (default first), and select the default.
  useEffect(() => {
    if (!authenticated || !buyerWallet) { setCardsLoaded(false); setCards([]); setChosenCardId(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const [pmR, ordR] = await Promise.all([
          fetch(`/api/stripe/payment-methods?wallet=${buyerWallet}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/payment-methods/order?wallet=${buyerWallet}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const pm = await pmR.json(); const ord = await ordR.json();
        const list: { id: string; brand: string; last4: string }[] = pmR.ok && Array.isArray(pm.methods) ? pm.methods : [];
        const order: string[] = ordR.ok && Array.isArray(ord.order) ? ord.order : [];
        const ordered = [
          ...(order.map(id => list.find(c => c.id === id)).filter(Boolean) as typeof list),
          ...list.filter(c => !order.includes(c.id)),
        ];
        if (!cancelled) { setCards(ordered); setChosenCardId(ordered[0]?.id ?? null); setCardsLoaded(true); }
      } catch {
        if (!cancelled) { setCards([]); setCardsLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated, buyerWallet, getAccessToken]);

  // Buyer's SOL balance, for the crypto-pay panel.
  useEffect(() => {
    if (!authenticated || !buyerWallet) { setSolBalance(null); return; }
    let cancelled = false;
    fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [buyerWallet] }) })
      .then(r => r.json())
      .then(d => { if (!cancelled && d.result?.value != null) setSolBalance(d.result.value / 1e9); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authenticated, buyerWallet]);

  // Create a PaymentIntent only when the buyer chooses to enter a card manually — the one-tap default
  // methods don't need a client-confirmed PaymentIntent.
  useEffect(() => {
    if (!session || session.status !== 'pending' || result) return;
    if (!authenticated || !walletReady || !buyerWallet || piSecret) return;
    if (!wantManual) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/sdk/payment-intent', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, buyer_wallet: buyerWallet }),
        });
        const d = await r.json();
        if (cancelled) return;
        if (d.client_secret) setPiSecret(d.client_secret);
        else setPiErr(d.error ?? 'Could not start checkout');
      } catch {
        if (!cancelled) setPiErr('Network error — could not start checkout');
      }
    })();
    return () => { cancelled = true; };
  }, [session, authenticated, walletReady, buyerWallet, piSecret, result, sessionId, wantManual]);

  const applyResult = useCallback((d: { order_id?: string; nft_address?: string; nft_mint_address?: string; minted?: boolean }) => {
    const res = { order_id: d.order_id ?? sessionId, nft_address: d.nft_address ?? d.nft_mint_address ?? '', minted: !!d.minted };
    setResult(res);
    // Let an opener (the 4c "Pay with Visby" button popup) react. Non-sensitive fields only.
    if (typeof window !== 'undefined' && window.opener) {
      try {
        window.opener.postMessage(
          { source: 'visby', type: 'visby:complete', order_id: res.order_id, nft_address: res.nft_address },
          '*'
        );
      } catch { /* opener gone or cross-origin restricted */ }
    }
  }, [sessionId]);

  const settle = useCallback(async (paymentIntentId: string) => {
    if (!buyerWallet) return;
    setSettling(true); setPayErr('');
    try {
      const r = await fetch('/api/sdk/settle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, buyer_wallet: buyerWallet, payment_intent_id: paymentIntentId }),
      });
      const d = await r.json();
      if (!r.ok || d.error || !d.ok) { setPayErr(d.error ?? 'Could not finalize your purchase. Your card was charged — contact the seller.'); return; }
      applyResult(d);
    } catch {
      setPayErr('Network error finalizing your purchase. Your card may have been charged — contact the seller.');
    } finally {
      setSettling(false);
    }
  }, [buyerWallet, sessionId, applyResult]);

  // One-tap: charge the buyer's saved card off-session and settle in a single call — no card entry,
  // no client confirm. Authed (charging a stored card requires proving wallet ownership).
  const oneTapPay = useCallback(async () => {
    if (!buyerWallet || !chosenCard) return;
    setSettling(true); setPayErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/sdk/charge-saved', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId, buyer_wallet: buyerWallet, payment_method_id: chosenCard.id }),
      });
      const d = await r.json();
      if (!r.ok || d.error || !d.ok) { setPayErr(d.error ?? 'Could not complete your purchase.'); return; }
      applyResult(d);
    } catch {
      setPayErr('Network error completing your purchase.');
    } finally {
      setSettling(false);
    }
  }, [buyerWallet, chosenCard, sessionId, getAccessToken, applyResult]);

  // Crypto one-tap: convert the USD total to SOL at the live rate, sign + send a transfer to the treasury
  // from the buyer's Visby wallet, then verify on-chain and settle.
  const payWithWallet = useCallback(async () => {
    if (!buyerWallet || !solWallet || !session) return;
    setSettling(true); setPayErr('');
    try {
      const pr = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const solPrice = (await pr.json())?.solana?.usd;
      if (!solPrice || solPrice <= 0) throw new Error('Could not get the SOL rate — try again or pay by card.');
      const lamports = Math.round((session.price_usdc / solPrice) * LAMPORTS_PER_SOL);
      const connection = new Connection(RPC, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(buyerWallet);
      tx.add(SystemProgram.transfer({ fromPubkey: new PublicKey(buyerWallet), toPubkey: new PublicKey(TREASURY), lamports }));
      const signed = await (solWallet as any).signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, 'confirmed');
      const r = await fetch('/api/sdk/charge-wallet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, buyer_wallet: buyerWallet, tx_signature: signature, quoted_sol_price: solPrice }),
      });
      const d = await r.json();
      if (!r.ok || d.error || !d.ok) { setPayErr(d.error ?? 'Could not complete your purchase.'); return; }
      applyResult(d);
    } catch (e: any) {
      const m = String(e?.message ?? '');
      const lowFunds = /insufficient|prior credit|debit an account|0x1\b/i.test(m);
      setPayErr(lowFunds ? 'Not enough SOL to cover this purchase plus the network fee. Add funds or pay by card.' : (m || 'Crypto payment failed.'));
    } finally {
      setSettling(false);
    }
  }, [buyerWallet, solWallet, session, sessionId, applyResult]);

  const pageWrap: React.CSSProperties = {
    minHeight: '100vh', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: `${S[6]}px ${S[4]}px`,
  };

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div style={pageWrap}>
        <div style={{ color: 'var(--text-muted)' }}><Spinner size={32} /></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Load error ───────────────────────────────────────────
  if (loadErr || !session) {
    return (
      <div style={pageWrap}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: '100%', maxWidth: 460, ...card(), padding: S[6], textAlign: 'center' }}>
          <div style={{ ...surface({ radius: '50%' }), width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `0 auto ${S[5]}px` }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[2] }}>Checkout unavailable</div>
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>{loadErr || 'This checkout link is invalid or has expired.'}</div>
        </div>
      </div>
    );
  }

  // paid / minted / failed all mean the buyer already paid (only 'cancelled' is a dead session).
  const isSettled = result || ['paid', 'minted', 'failed'].includes(session.status);

  return (
    <div style={pageWrap}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pop { 0% { transform: scale(.7); opacity: 0; } 80% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } } @keyframes slidein { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }`}</style>

      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: S[5] }}>

        {/* Brand header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2] }}>
          <img src="/visby-logo-mark.png" alt="" aria-hidden style={{ height: 30, width: 'auto', filter: 'brightness(0.55)' }} />
          <div style={{ ...t('heading'), fontFamily: "'Quicksand', sans-serif", color: 'var(--text-strong)', fontStyle: 'italic', fontWeight: 700, fontSize: 18, letterSpacing: '-.01em' }}>VisbyPay</div>
        </div>

        {/* Product card */}
        <div style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
            <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Sold by</span>
            <span style={{ ...t('heading'), color: 'var(--text-strong)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.merchant_name}</span>
          </div>
          <div style={{ height: 1, background: 'var(--divider)' }} />
          <div>
            <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[1] }}>{session.product_name}</div>
            {session.serial_number && (
              <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>S/N {session.serial_number}</div>
            )}
          </div>
          <div style={{ ...surface({ pad: `${S[4]}px ${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {authenticated && buyerWallet && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
                <span style={{ ...t('meta'), color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: S[2] }}>
                  <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }}><WalletGlyph size={14} /></span>
                  NFT delivers to
                </span>
                <span style={{ ...t('meta'), color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{shortAddr(buyerWallet)}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Total{currency !== 'USD' ? ' (USD)' : ''}</span>
              <span style={price('md')}>${session.price_usdc.toFixed(2)}</span>
            </div>
            {currency !== 'USD' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: S[3] }}>
                <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  In {currency} · est. incl. transfer fees
                </span>
                <span style={{ ...t('heading'), color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                  ≈ {format(session.price_usdc * (1 + XFER_FEE))}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── SUCCESS ─────────────────────────────────────── */}
        {result ? (
          <div style={{ ...card(), padding: S[6], textAlign: 'center', animation: 'pop .4s ease-out' }}>
            <div style={{ ...surface({ radius: '50%' }), width: 72, height: 72, background: 'var(--ok-soft)', border: '1px solid var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `0 auto ${S[5]}px` }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[2] }}>
              {result.minted ? 'Provenance NFT minted' : 'Payment received'}
            </div>
            <div style={{ ...t('body'), color: 'var(--text-muted)', marginBottom: S[5] }}>
              {result.minted
                ? 'You now own the verified chain of custody for this item. You can close this window.'
                : 'Your payment went through. Your provenance NFT is being finalized and will land in your wallet shortly.'}
            </div>
            {result.minted && result.nft_address && (
              <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'inline-flex', alignItems: 'center', gap: S[2], marginBottom: S[5] }}>
                <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>NFT</span>
                <span style={{ ...t('meta'), color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{shortAddr(result.nft_address)}</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {session.success_url && (
                <a href={session.success_url} style={{ ...btn('primary', { full: true }) }}>
                  Return to {session.merchant_name}
                </a>
              )}
            </div>
          </div>
        ) : isSettled ? (
          /* Already completed by a prior settle — show a calm terminal state. */
          <div style={{ ...card(), padding: S[6], textAlign: 'center' }}>
            <div style={{ ...surface({ radius: '50%' }), width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `0 auto ${S[5]}px`, background: 'var(--ok-soft)', border: '1px solid var(--ok-soft)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[2] }}>Already completed</div>
            <div style={{ ...t('body'), color: 'var(--text-muted)' }}>This checkout has already been paid. You can close this window.</div>
            {session.success_url && (
              <a href={session.success_url} style={{ ...btn('primary', { full: true }), marginTop: S[5] }}>
                Return to {session.merchant_name}
              </a>
            )}
          </div>
        ) : session.status !== 'pending' ? (
          /* Failed / cancelled / expired. */
          <div style={{ ...card(), padding: S[6], textAlign: 'center' }}>
            <div style={{ ...surface({ radius: '50%' }), width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `0 auto ${S[5]}px` }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            </div>
            <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[2] }}>This checkout has expired</div>
            <div style={{ ...t('body'), color: 'var(--text-muted)' }}>This session is no longer available. Start a new checkout from the seller.</div>
            {session.cancel_url && (
              <a href={session.cancel_url} style={{ ...btn('secondary', { full: true }), marginTop: S[5] }}>Back to {session.merchant_name}</a>
            )}
          </div>
        ) : (
          /* ── PAY ──────────────────────────────────────── */
          <div style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', gap: S[4] }}>
            {previewPay ? (
              <DefaultPayPanel
                method={previewPay}
                priceUsdc={session.price_usdc}
                currency={currency}
                format={format}
                last4={demoPay.last4}
                balance={demoPay.balance}
                onPay={() => {}}
                onUseAnother={() => {}}
              />
            ) : !privyReady ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: S[3], padding: `${S[5]}px 0`, color: 'var(--text-muted)' }}>
                <Spinner /> <span style={{ ...t('body') }}>Loading…</span>
              </div>
            ) : !authenticated ? (
              <SignedOutFlow login={login} />
            ) : !buyerWallet ? (
              creatingWallet ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3], padding: `${S[5]}px 0`, color: 'var(--text-muted)' }}>
                  <Spinner size={28} /> <span style={{ ...t('body') }}>Setting up your secure wallet…</span>
                </div>
              ) : walletErr ? (
                <>
                  <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)', borderRadius: 'var(--r)', padding: `${S[3]}px ${S[4]}px`, ...t('body'), color: RED }}>
                    {walletErr}
                  </div>
                  <button onClick={makeWallet} style={{ ...btn('primary', { full: true }) }}>Retry wallet setup</button>
                </>
              ) : (
                <>
                  <div style={{ ...t('body'), color: 'var(--text-muted)', textAlign: 'center' }}>
                    One quick step — set up your Visby wallet to receive your provenance NFT.
                  </div>
                  <button onClick={makeWallet} style={{ ...btn('primary', { full: true }) }}>Set up wallet</button>
                </>
              )
            ) : payErr ? (
              <>
                <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)', borderRadius: 'var(--r)', padding: `${S[3]}px ${S[4]}px`, ...t('body'), color: RED }}>
                  {payErr}
                </div>
                <button onClick={() => { setPayErr(''); setSettling(false); }} style={{ ...btn('secondary', { full: true }) }}>Try again</button>
              </>
            ) : settling ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3], padding: `${S[5]}px 0`, color: 'var(--text-muted)' }}>
                <Spinner size={28} />
                <span style={{ ...t('body') }}>Minting your provenance NFT…</span>
              </div>
            ) : cryptoMode ? (
              <CryptoPayPanel priceUsdc={session.price_usdc} solBalance={solBalance} onPay={payWithWallet} onBack={() => setCryptoMode(false)} />
            ) : pickerOpen ? (
              <MethodPicker
                cards={cards}
                chosenId={chosenCard?.id ?? null}
                hasCrypto={!!solWallet}
                onPickCard={id => { setChosenCardId(id); setPickerOpen(false); }}
                onPickCrypto={() => { setPickerOpen(false); setCryptoMode(true); }}
                onNewCard={() => { setPickerOpen(false); setShowManualCard(true); }}
                onCancel={() => setPickerOpen(false)}
              />
            ) : !wantManual && chosenCard ? (
              <DefaultPayPanel
                method="card"
                priceUsdc={session.price_usdc}
                currency={currency}
                format={format}
                last4={chosenCard.last4}
                onPay={oneTapPay}
                onUseAnother={() => setPickerOpen(true)}
              />
            ) : piErr ? (
              <>
                <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)', borderRadius: 'var(--r)', padding: `${S[3]}px ${S[4]}px`, ...t('body'), color: RED }}>
                  {piErr}
                </div>
                <button onClick={() => { setPiErr(''); setPiSecret(null); }} style={{ ...btn('secondary', { full: true }) }}>Try again</button>
              </>
            ) : piSecret ? (
              <>
                <Elements stripe={stripePromise} key={mode}>
                  <CardPayForm
                    priceUsdc={session.price_usdc}
                    clientSecret={piSecret}
                    onSuccess={settle}
                    onError={msg => setPayErr(msg)}
                  />
                </Elements>
                {solWallet && (
                  <button onClick={() => setCryptoMode(true)} style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', background: 'none', border: 0, cursor: 'pointer', padding: 0, marginTop: S[3] }}>Pay with crypto balance</button>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: S[3], padding: `${S[5]}px 0`, color: 'var(--text-muted)' }}>
                <Spinner /> <span style={{ ...t('body') }}>Loading payment…</span>
              </div>
            )}

            {session.cancel_url && !settling && (
              <a href={session.cancel_url} style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', textDecoration: 'none' }}>
                Cancel
              </a>
            )}
          </div>
        )}

        {/* Trust footer */}
        <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S[2] }}>
          <span style={{ display: 'inline-flex' }}><ShieldIcon /></span>
          Secured by <span style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700 }}>Visby</span> · Solana provenance
        </div>

      </div>
    </div>
  );
}
