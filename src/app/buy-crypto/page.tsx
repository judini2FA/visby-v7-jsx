'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { useVisbWallet } from '@/lib/wallet';
import { useTheme } from '@/lib/theme';
import { useCurrency } from '@/lib/currency';
import { USDC_MINT, USDC_DECIMALS } from '@/lib/usdc';
import { t, S, price, card, surface, btn, badge, sectionLabel, input } from '@/lib/ui';
import { HeaderMenu } from '@/components/layout/header-menu';

type Asset = 'SOL' | 'USDC';

const C = {
  navy: 'transparent',
  cyan: '#25CDB8',
  blue: '#2A8AED',
  mag: '#BC2DE6',
  muted: 'var(--text-muted)',
  green: 'var(--ok)',
  red: 'var(--danger)',
  border: 'var(--glass-border)',
};

const RPC = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type AmountChip = 10 | 25 | 50 | 'custom';

interface Quote {
  usd: number;
  asset: Asset;
  unit_price: number;
  token_amount: number;
  token_display: string;
  sol_price?: number;
  lamports: number;
}

// Stripe CardElement can't read CSS variables — pass concrete colors per theme mode.
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

function Spinner() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        opacity: 0.7,
        animation: 'spin .8s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

async function fetchSolBalance(addr: string): Promise<number | null> {
  try {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] }),
    });
    const d = await res.json();
    return d.result?.value != null ? d.result.value / 1e9 : null;
  } catch {
    return null;
  }
}

async function fetchUsdcBalance(addr: string): Promise<number | null> {
  try {
    const connection = new Connection(RPC, 'confirmed');
    const ata = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), new PublicKey(addr));
    const acc = await getAccount(connection, ata);
    return Number(acc.amount) / 10 ** USDC_DECIMALS;
  } catch {
    return 0;
  }
}

// ── Card payment form — inside <Elements> context ──────────────
function CardPayForm({
  usd,
  asset,
  wallet,
  onSuccess,
  onError,
}: {
  usd: number;
  asset: Asset;
  wallet: string;
  onSuccess: (token_amount: number) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { mode } = useTheme();
  const [paying, setPaying] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    const cardEl = elements.getElement(CardElement);
    if (!cardEl) return;
    setPaying(true);

    try {
      const intentRes = await fetch('/api/onramp/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, usd, asset }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok || !intentData.client_secret) {
        onError(intentData.error ?? 'Could not start payment');
        setPaying(false);
        return;
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(
        intentData.client_secret,
        { payment_method: { card: cardEl } },
      );

      if (error) {
        onError(error.message ?? 'Payment failed');
        setPaying(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        const fulfillRes = await fetch('/api/onramp/fulfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_intent_id: paymentIntent.id }),
        });
        const fulfillData = await fulfillRes.json();
        if (fulfillData.ok) {
          onSuccess(fulfillData.token_amount);
        } else {
          onError(fulfillData.error ?? `${asset} transfer failed`);
          setPaying(false);
        }
      } else {
        onError('Payment did not complete');
        setPaying(false);
      }
    } catch (err: any) {
      onError(err.message ?? 'Payment failed');
      setPaying(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div
        style={{
          background: 'var(--field-input-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--r-sm)',
          padding: '16px 16px',
        }}
      >
        <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Card details</div>
        <CardElement options={{ style: cardStyle(mode === 'dark'), hidePostalCode: true }} />
      </div>

      <div
        style={{
          ...surface({ pad: '12px 16px' }),
          ...t('meta'),
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        Test mode — use card 4242 4242 4242 4242, any future expiry, any CVC.
      </div>

      <button
        type="submit"
        disabled={paying || !stripe}
        style={{
          ...btn('primary', { full: true, pill: false }),
          opacity: paying || !stripe ? 0.7 : 1,
          cursor: paying || !stripe ? 'not-allowed' : 'pointer',
        }}
      >
        {paying ? (
          <>
            <Spinner /> Processing…
          </>
        ) : (
          `Buy ${asset}`
        )}
      </button>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function BuyCryptoPage() {
  const router = useRouter();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { address: wallet } = useVisbWallet();
  const { symbol, currency, toUsdc } = useCurrency();

  const [asset, setAsset] = useState<Asset>('SOL');
  const [chip, setChip] = useState<AmountChip>(25);
  const [customAmount, setCustomAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteErr, setQuoteErr] = useState('');

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [cardErr, setCardErr] = useState('');
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetErr, setFaucetErr] = useState('');

  type Phase = 'idle' | 'card_success' | 'faucet_success';
  const [phase, setPhase] = useState<Phase>('idle');
  const [addedAmount, setAddedAmount] = useState(0);

  const amountCur = chip === 'custom' ? parseFloat(customAmount) || 0 : (chip as number);
  const usd = Number(toUsdc(amountCur).toFixed(2));
  const usdOutOfRange = usd > 0 && (usd < 1 || usd > 1000);

  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    setBalanceLoading(true);
    const b = asset === 'USDC' ? await fetchUsdcBalance(wallet) : await fetchSolBalance(wallet);
    setBalance(b);
    setBalanceLoading(false);
  }, [wallet, asset]);

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace('/login');
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (wallet) refreshBalance();
  }, [wallet, refreshBalance]);

  useEffect(() => {
    if (!usd || usd < 1 || usd > 1000) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteErr('');
    fetch(`/api/onramp/quote?usd=${usd}&asset=${asset}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.error) {
          setQuoteErr(d.error);
          setQuote(null);
        } else {
          setQuote(d as Quote);
        }
        setQuoteLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setQuoteErr('Could not fetch price');
          setQuoteLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [usd, asset]);

  async function handleFaucet() {
    if (!wallet) return;
    setFaucetLoading(true);
    setFaucetErr('');
    try {
      const authToken = await getAccessToken();
      const res = await fetch('/api/onramp/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ wallet, asset }),
      });
      const data = await res.json();
      if (data.ok) {
        setAddedAmount(data.token_amount);
        setPhase('faucet_success');
        await refreshBalance();
      } else {
        setFaucetErr(data.error ?? 'Faucet request failed');
      }
    } catch (err: any) {
      setFaucetErr(err.message ?? 'Network error');
    } finally {
      setFaucetLoading(false);
    }
  }

  function handleCardSuccess(token_amount: number) {
    setAddedAmount(token_amount);
    setPhase('card_success');
    setCardErr('');
    refreshBalance();
  }

  if (!ready) return null;
  if (ready && !authenticated) return null;

  const balanceDp = asset === 'USDC' ? 2 : 4;
  const balanceDisplay = balanceLoading ? '…' : balance != null ? balance.toFixed(balanceDp) : (0).toFixed(balanceDp);
  const addedDisplay = addedAmount.toFixed(balanceDp);

  return (
    <div style={{ background: C.navy, minHeight: '100vh', fontFamily: "'Manrope', sans-serif" }}>

      {/* Sticky header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
          WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
          borderBottom: '1px solid var(--divider)',
          boxShadow: '0 2px 16px rgba(0,0,0,.06)',
        }}
      >
        <div
          className="visby-page"
          style={{
            paddingTop: S[3],
            paddingBottom: S[3],
            display: 'flex',
            alignItems: 'center',
            gap: S[3],
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: S[1],
              display: 'flex',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ flex: 1, ...t('heading'), color: 'var(--text-strong)' }}>Add Funds</div>
          <HeaderMenu />
        </div>
      </div>

      <div className="visby-page" style={{ paddingTop: S[5], paddingBottom: 100, display: 'flex', flexDirection: 'column', gap: S[6] }}>

        {/* Wallet + balance */}
        <div style={{ ...surface({ pad: S[4] }), display: 'flex', alignItems: 'center', gap: S[3] }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z" />
              <circle cx="17" cy="14" r="1" fill="#fff" stroke="none" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Wallet</div>
            <div style={{ ...t('body'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {wallet ? shortAddr(wallet) : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{asset} balance</div>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>
              {balanceDisplay} {asset}
            </div>
          </div>
        </div>

        {/* ── Success states ── */}
        {phase !== 'idle' && (
          <div
            style={{
              background: `${C.green}12`,
              border: `1px solid ${C.green}44`,
              borderRadius: 'var(--r-lg)',
              padding: S[5],
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: S[3],
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: `${C.green}20`,
                border: `2px solid ${C.green}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>
                {phase === 'faucet_success' ? `Test ${asset} received` : 'Funds added'}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: S[1], justifyContent: 'center' }}>
                <span style={{ ...price('md') }}>{addedDisplay} {asset}</span>
                <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>added</span>
              </div>
              <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[2] }}>
                New balance: {balanceDisplay} {asset}
              </div>
            </div>
            <button
              onClick={() => { setPhase('idle'); setCardErr(''); setFaucetErr(''); }}
              style={{ ...btn('secondary'), marginTop: S[1] }}
            >
              Add more
            </button>
          </div>
        )}

        {phase === 'idle' && (
          <>
            {/* Token picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
              <div style={sectionLabel()}>Token to add</div>
              <div style={{ display: 'flex', gap: S[2] }}>
                {(['SOL', 'USDC'] as const).map(tk => {
                  const active = asset === tk;
                  return (
                    <button
                      key={tk}
                      onClick={() => { if (asset !== tk) { setAsset(tk); setQuote(null); } }}
                      style={{
                        flex: 1,
                        border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--pill)',
                        padding: '11px 18px',
                        cursor: 'pointer',
                        fontFamily: "'Manrope',sans-serif",
                        fontSize: 15,
                        fontWeight: 700,
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

            {/* Amount selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
              <div style={sectionLabel()}>Amount ({currency})</div>
              <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                {([10, 25, 50] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => { setChip(v); setCustomAmount(''); }}
                    style={{
                      ...btn(chip === v ? 'primary' : 'secondary', { pill: false }),
                      minWidth: 72,
                      flex: 1,
                    }}
                  >
                    {symbol}{v}
                  </button>
                ))}
                <button
                  onClick={() => setChip('custom')}
                  style={{
                    ...btn(chip === 'custom' ? 'primary' : 'secondary', { pill: false }),
                    minWidth: 72,
                    flex: 1,
                  }}
                >
                  Custom
                </button>
              </div>
              {chip === 'custom' && (
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: S[4],
                      top: '50%',
                      transform: 'translateY(-50%)',
                      ...t('body'),
                      color: 'var(--text-muted)',
                    }}
                  >
                    {symbol}
                  </div>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    step="0.01"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    placeholder="Enter amount"
                    style={{ ...input(), paddingLeft: S[6] }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      right: S[4],
                      top: '50%',
                      transform: 'translateY(-50%)',
                      ...t('meta'),
                      color: 'var(--text-muted)',
                    }}
                  >
                    {currency}
                  </div>
                </div>
              )}
              {usdOutOfRange && (
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  Enter an amount between {symbol}{Number((1 / toUsdc(1)).toFixed(2))} and {symbol}{Number((1000 / toUsdc(1)).toFixed(2))} ({currency}) to continue.
                </div>
              )}
            </div>

            {/* Quote display */}
            {usd >= 1 && usd <= 1000 && (
              <div style={{ ...surface({ pad: S[4] }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
                <div>
                  <div style={{ ...sectionLabel(), marginBottom: S[1] }}>You get approximately</div>
                  {quoteLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[2], color: 'var(--text-muted)' }}>
                      <Spinner />
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Fetching price…</span>
                    </div>
                  ) : quoteErr ? (
                    <div style={{ ...t('meta'), color: C.red }}>{quoteErr}</div>
                  ) : quote ? (
                    <span style={price('md')}>≈ {quote.token_display}</span>
                  ) : null}
                </div>
                {quote && !quoteLoading && asset === 'SOL' && quote.sol_price != null && (
                  <div style={{ ...t('micro'), color: 'var(--text-muted)', textAlign: 'right' }}>
                    1 SOL ={'\n'}${quote.sol_price.toFixed(2)}
                  </div>
                )}
              </div>
            )}

            {/* Card payment */}
            <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                <div
                  style={{
                    ...surface({ radius: 'var(--r-sm)' }),
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Buy with card</div>
              </div>

              {cardErr && (
                <div
                  style={{
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-soft)',
                    borderRadius: 'var(--r-sm)',
                    padding: '12px 16px',
                    ...t('body'),
                    color: C.red,
                  }}
                >
                  {cardErr}
                </div>
              )}

              {usd >= 1 && usd <= 1000 ? (
                <Elements stripe={stripePromise}>
                  <CardPayForm
                    usd={usd}
                    asset={asset}
                    wallet={wallet}
                    onSuccess={handleCardSuccess}
                    onError={msg => setCardErr(msg)}
                  />
                </Elements>
              ) : (
                <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
                  Select an amount above to continue.
                </div>
              )}
            </div>

            {/* Devnet faucet */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
              <div style={{ height: 1, background: 'var(--divider)' }} />
              <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center' }}>
                On devnet? Get free test {asset} instead.
              </div>

              {faucetErr && (
                <div
                  style={{
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-soft)',
                    borderRadius: 'var(--r-sm)',
                    padding: '12px 16px',
                    ...t('body'),
                    color: C.red,
                  }}
                >
                  {faucetErr}
                </div>
              )}

              <button
                onClick={handleFaucet}
                disabled={faucetLoading || !wallet}
                style={{
                  ...btn('secondary', { full: true, pill: false }),
                  opacity: faucetLoading || !wallet ? 0.6 : 1,
                  cursor: faucetLoading || !wallet ? 'not-allowed' : 'pointer',
                }}
              >
                {faucetLoading ? (
                  <>
                    <Spinner /> Requesting…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10" />
                      <polyline points="12 8 12 12 14 14" />
                    </svg>
                    Get test {asset} (devnet)
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
