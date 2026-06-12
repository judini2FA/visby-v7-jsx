'use client';

import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { ThemeToggle, useTheme } from '@/lib/theme';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const GD = `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`;

type Tab = 'public' | 'wallet' | 'items';

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

async function fetchSolBalance(addr: string, rpc: string): Promise<number | null> {
  try {
    const res = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] }) });
    const d = await res.json();
    return d.result?.value != null ? d.result.value / 1e9 : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// PAYOUT (shown at bottom of Wallet tab)
// ─────────────────────────────────────────────────────────────
function PayoutSection({ wallet }: { wallet: string }) {
  const [payoutType, setPayoutType] = useState<'bank' | 'crypto'>('crypto');
  const [stripeAccountId, setStripeAccountId] = useState('');
  const [cryptoWallet,    setCryptoWallet]    = useState(wallet);
  const [cryptoChain,     setCryptoChain]     = useState('solana');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/payout?wallet=${wallet}`)
      .then(r => r.json())
      .then(d => {
        if (!d.settings) return;
        setPayoutType(d.settings.payout_type ?? 'crypto');
        setStripeAccountId(d.settings.stripe_account_id ?? '');
        setCryptoWallet(d.settings.crypto_wallet ?? wallet);
        setCryptoChain(d.settings.crypto_chain ?? 'solana');
      })
      .catch(() => {});
  }, [wallet]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving'); setErrMsg('');
    try {
      const res = await fetch('/api/payout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller_wallet: wallet, payout_type: payoutType, stripe_account_id: payoutType === 'bank' ? stripeAccountId : undefined, crypto_wallet: payoutType === 'crypto' ? cryptoWallet : undefined, crypto_chain: payoutType === 'crypto' ? cryptoChain : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err: any) { setErrMsg(err.message ?? 'Save failed'); setStatus('error'); }
  }

  const INPUT: React.CSSProperties = { width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '13px 16px', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: "'Quicksand',sans-serif", boxSizing: 'border-box' };

  return (
    <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 24, marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>Payout Settings</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
        Choose how you receive payment when an item sells.
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {(['crypto', 'bank'] as const).map(t => (
            <button key={t} type="button" onClick={() => setPayoutType(t)}
              style={{ background: payoutType === t ? 'var(--glass-bg-strong)' : 'var(--glass-bg)', border: `1.5px solid ${payoutType === t ? 'var(--glass-border)' : 'var(--glass-border)'}`, borderRadius: 14, padding: '14px 12px', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: payoutType === t ? 'var(--text-strong)' : 'var(--text-strong)', marginBottom: 3 }}>
                {t === 'crypto' ? 'Crypto wallet' : 'Bank account'}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {t === 'crypto' ? 'SOL/USDC · instant' : 'via Stripe · 2–7 days'}
              </div>
            </button>
          ))}
        </div>

        {payoutType === 'crypto' && (
          <>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Receiving wallet</div>
              <input value={cryptoWallet} onChange={e => setCryptoWallet(e.target.value)} placeholder="Solana wallet address" style={INPUT} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Chain</div>
              <select value={cryptoChain} onChange={e => setCryptoChain(e.target.value)}
                style={{ ...INPUT, background: 'var(--glass-bg)', cursor: 'pointer' }}>
                <option value="solana">Solana (SOL / USDC)</option>
                <option value="ethereum">Ethereum (ETH / USDC)</option>
              </select>
            </div>
          </>
        )}

        {payoutType === 'bank' && (
          <div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Stripe Connect account ID</div>
            <input value={stripeAccountId} onChange={e => setStripeAccountId(e.target.value)} placeholder="acct_1ABC123…" style={INPUT} />
          </div>
        )}

        {errMsg && <div style={{ background: 'rgba(255,59,92,.08)', border: '1px solid rgba(255,59,92,.2)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.red }}>{errMsg}</div>}

        <button type="submit" disabled={status === 'saving'}
          style={{ width: '100%', background: status === 'saved' ? `${C.green}22` : status === 'saving' ? 'rgba(255,255,255,.1)' : GH, border: status === 'saved' ? `1px solid ${C.green}44` : 'none', borderRadius: 14, padding: '14px', fontWeight: 700, fontSize: 14, color: status === 'saved' ? C.green : '#fff', cursor: status === 'saving' ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : 'Save Payout Settings'}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// APPEARANCE (theme toggle, shown in Wallet tab)
// ─────────────────────────────────────────────────────────────
function AppearanceRow() {
  const { mode } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '14px 16px', marginBottom: 12, boxShadow: 'var(--glass-shadow), var(--glass-inner)' }}>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>Appearance</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mode === 'dark' ? 'Night' : 'Day'} mode</span>
      </div>
      <div style={{ marginLeft: 'auto' }}><ThemeToggle /></div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WALLET TAB
// ─────────────────────────────────────────────────────────────
function WalletTab({ exportWallet, logout }: { exportWallet: () => void; logout: () => void }) {
  const { address: wallet } = useVisbWallet();
  const { wallets: solanaWallets, createWallet: createSolanaWallet } = useSolanaWallets();
  const [balance, setBalance]       = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [creating, setCreating]     = useState(false);

  const solAddress = solanaWallets[0]?.address ?? '';

  useEffect(() => {
    if (!solAddress) return;
    setBalanceLoading(true);
    const rpc = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
    fetchSolBalance(solAddress, rpc).then(b => { setBalance(b); setBalanceLoading(false); });
  }, [solAddress]);

  const balanceDisplay = balanceLoading ? '…' : balance != null ? balance.toFixed(4) : '0.0000';

  return (
    <div style={{ paddingTop: 16 }}>
      {/* SOL balance card */}
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', marginBottom: 16, textTransform: 'uppercase' }}>
          Solana Wallet
        </div>
        {solAddress ? (
          <>
            <div style={{ fontSize: 42, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>
              {balanceDisplay}
            </div>
            <div style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600 }}>SOL</div>
            {balance === 0 && !balanceLoading && (
              <div style={{ background: 'var(--glass-bg)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Get free devnet SOL at{' '}
                <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" style={{ color: 'var(--text-strong)', textDecoration: 'none', fontWeight: 600 }}>faucet.solana.com</a>
                {' '}→ paste your address below
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20, wordBreak: 'break-all', padding: '0 8px', cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(solAddress)} title="Click to copy">
              {solAddress}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>No Solana wallet yet</div>
            <button onClick={async () => { setCreating(true); try { await createSolanaWallet(); } catch {} setCreating(false); }}
              disabled={creating}
              style={{ background: GH, border: 'none', borderRadius: 14, padding: '14px 28px', fontWeight: 700, fontSize: 14, color: '#fff', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Creating…' : 'Create Solana Wallet'}
            </button>
          </>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link href="/dashboard/seller" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: GH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text)' }}>Mint</span>
          </Link>
          <div onClick={() => exportWallet()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: GH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text)' }}>Export</span>
          </div>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: GH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text)' }}>Shop</span>
          </Link>
        </div>
      </div>

      {/* Payment methods */}
      <div style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 16, marginBottom: 12, boxShadow: 'var(--glass-shadow), var(--glass-inner)' }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Payment Methods</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: `${C.green}10`, border: `1px solid ${C.green}30`, borderRadius: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${C.green}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Card via Stripe</div>
              <div style={{ fontSize: 11, color: C.muted }}>Pay with any credit or debit card</div>
            </div>
            <div style={{ fontSize: 10, color: C.green, background: `${C.green}20`, borderRadius: 6, padding: '3px 7px' }}>ACTIVE</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Crypto (SOL, ETH, BTC)</div>
              <div style={{ fontSize: 11, color: C.muted }}>Coming in Phase 3</div>
            </div>
            <div style={{ fontSize: 10, color: C.muted, background: 'var(--glass-bg)', borderRadius: 6, padding: '3px 7px' }}>SOON</div>
          </div>
        </div>
      </div>

      {/* Wallet security */}
      <div style={{ border: `2px solid var(--glass-border)`, borderRadius: 18, padding: 18, marginBottom: 12, background: 'var(--glass-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Wallet Security</div>
        </div>
        <button onClick={() => exportWallet()} style={{ width: '100%', background: GH, border: 'none', borderRadius: 14, padding: '15px 20px', fontWeight: 700, fontSize: 15, color: '#fff', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export Private Key / Backup Wallet
        </button>
        <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>MPC Wallet</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
            Your key is split across secure servers. Export your private key anytime to import into Phantom or Solflare.
          </div>
        </div>
      </div>

      {/* Appearance */}
      <AppearanceRow />

      {/* Payout settings */}
      <PayoutSection wallet={wallet} />

      {/* Sign out */}
      <button onClick={logout} style={{ width: '100%', background: 'rgba(255,59,92,.08)', border: '1px solid rgba(255,59,92,.25)', borderRadius: 14, padding: '13px 20px', fontWeight: 700, fontSize: 14, color: C.red, cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", marginTop: 24 }}>
        Sign Out
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MY ITEMS TAB
// ─────────────────────────────────────────────────────────────
function MyItemsTab({ wallet }: { wallet: string }) {
  const { data: ownedItems = [], isLoading } = trpc.listings.getByOwner.useQuery({ wallet }, { enabled: !!wallet });

  if (isLoading) return (
    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, background: 'var(--glass-bg)', borderRadius: 14, animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (ownedItems.length === 0) return (
    <div style={{ paddingTop: 40, textAlign: 'center' }}>
      <div style={{ background: 'var(--glass-bg)', border: '2px dashed var(--glass-border)', borderRadius: 20, padding: '40px 20px' }}>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 6 }}>No items yet</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Mint your first item to see it here</div>
        <Link href="/dashboard/seller" style={{ display: 'inline-block', background: GH, borderRadius: 12, padding: '11px 24px', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          Mint First Item
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ownedItems.map((item: any) => (
        <Link key={item.id} href={`/item/${item.id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '12px 14px', textDecoration: 'none', boxShadow: 'var(--glass-shadow), var(--glass-inner)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 10, background: GD, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {item.image_url
              ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase' }}>{item.category?.slice(0,3)}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.condition} · {item.category}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {item.is_listed && item.price_usdc ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>${item.price_usdc}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>LISTED</div>
              </>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>NOT LISTED</div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PUBLIC VIEW TAB
// ─────────────────────────────────────────────────────────────
function PublicViewTab({ wallet, displayName, bio }: { wallet: string; displayName: string; bio?: string | null }) {
  const { data: ownedItems = [] } = trpc.listings.getByOwner.useQuery({ wallet }, { enabled: !!wallet });
  const listedItems = ownedItems.filter((i: any) => i.is_listed);

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Preview banner */}
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: C.muted }}>Viewing as others see you</div>
        <Link href={`/p/${wallet}`} style={{ fontSize: 12, color: 'var(--text-strong)', textDecoration: 'none' }}>Open full page →</Link>
      </div>

      {/* Avatar card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '18px 16px', marginBottom: 20, boxShadow: 'var(--glass-shadow), var(--glass-inner)' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: wallet ? `linear-gradient(135deg, hsl(${(wallet.charCodeAt(0)*7)%360},70%,55%), hsl(${(wallet.charCodeAt(4)*13)%360},70%,45%))` : GD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0, position: 'relative' }}>
          {(displayName[0] ?? '?').toUpperCase()}
          <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: 'var(--glass-bg-strong)', border: '2px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 2 }}>{displayName}</div>
          {bio && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{bio}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
            {shortAddr(wallet)} · Verified
          </div>
        </div>
      </div>

      {/* Active listings preview */}
      {listedItems.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
            {listedItems.length} active listing{listedItems.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {listedItems.slice(0, 4).map((item: any) => (
              <Link key={item.id} href={`/item/${item.id}`}
                style={{ textDecoration: 'none', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, overflow: 'hidden' }}>
                <div style={{ height: 100, background: 'var(--glass-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.category}</span>
                  }
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginTop: 2 }}>
                    ${item.price_usdc}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {listedItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 13, color: 'var(--text-muted)' }}>
          No active listings
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EDIT PROFILE FORM
// ─────────────────────────────────────────────────────────────
function EditProfileForm({ wallet, email, onClose }: { wallet: string; email?: string; onClose: () => void }) {
  const { data: existing } = trpc.profiles.getProfile.useQuery({ wallet }, { enabled: !!wallet });
  const upsert = trpc.profiles.upsertProfile.useMutation();
  const [name, setName] = useState('');
  const [bio,  setBio]  = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) {
      setName(existing.display_name ?? '');
      setBio(existing.bio ?? '');
    }
  }, [existing?.display_name, existing?.bio]);

  const displayName = name || existing?.display_name || '';
  const displayBio  = bio  || existing?.bio  || '';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await upsert.mutateAsync({ wallet, display_name: name.trim() || undefined, bio: bio.trim() || undefined });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  }

  const INPUT: React.CSSProperties = { width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '13px 16px', color: 'var(--text)', fontSize: 15, outline: 'none', fontFamily: "'Quicksand',sans-serif" };

  return (
    <div style={{ padding: '0 16px 40px', maxWidth: 600, margin: '0 auto' }}>

      {/* Preview */}
      <div style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '18px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--glass-shadow), var(--glass-inner)' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: wallet ? `linear-gradient(135deg, hsl(${(wallet.charCodeAt(0)*7)%360},70%,55%), hsl(${(wallet.charCodeAt(4)*13)%360},70%,45%))` : GD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
          {wallet.slice(0,2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 2 }}>
            {displayName || wallet.slice(0,6) + '…' + wallet.slice(-4)}
          </div>
          {displayBio && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayBio}</div>}
          <div style={{ fontSize: 11, color: C.muted }}>{email ?? shortAddr(wallet)}</div>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Display Name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={existing?.display_name ?? 'e.g. sneaker.vault'} maxLength={40} style={INPUT} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>Shown instead of your wallet address</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Bio</div>
          <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder={existing?.bio ?? 'What do you sell?'} maxLength={200} rows={3}
            style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6 }} />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{bio.length}/200</div>
        </div>
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Wallet (read-only)</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{wallet}</div>
        </div>
        {email && (
          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Email (read-only)</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{email}</div>
          </div>
        )}
        {upsert.isError && (
          <div style={{ background: 'rgba(255,59,92,.1)', border: '1px solid rgba(255,59,92,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: C.red }}>
            Could not save — check your connection and try again.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '14px', fontWeight: 600, fontSize: 14, color: 'var(--text)', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
            Cancel
          </button>
          <button type="submit" disabled={upsert.isPending}
            style={{ flex: 2, background: saved ? C.green : upsert.isPending ? 'rgba(255,255,255,.1)' : GH, border: 'none', borderRadius: 14, padding: '14px', fontWeight: 700, fontSize: 15, color: '#fff', cursor: upsert.isPending ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}>
            {saved ? '✓ Saved!' : upsert.isPending ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { ready, authenticated, user, logout, exportWallet } = usePrivy();
  const { address: walletAddress, ready: walletReady } = useVisbWallet();
  const router = useRouter();
  const [tab, setTab]         = useState<Tab>('public');
  const [editOpen, setEditOpen] = useState(false);

  const { data: profile }        = trpc.profiles.getProfile.useQuery({ wallet: walletAddress }, { enabled: !!walletAddress });
  const { data: ownedItems = [] } = trpc.listings.getByOwner.useQuery({ wallet: walletAddress }, { enabled: !!walletAddress });
  const { data: soldItems  = [] } = trpc.listings.getSoldByWallet.useQuery({ wallet: walletAddress }, { enabled: !!walletAddress });

  const displayName = profile?.display_name ?? user?.email?.address ?? shortAddr(walletAddress);
  const initial     = (displayName[0] ?? '?').toUpperCase();
  const listedCount = ownedItems.filter((i: any) => i.is_listed).length;
  const email       = user?.email?.address;

  useEffect(() => {
    if (ready && !authenticated) router.push('/login');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated || !walletReady) {
    return (
      <div style={{ background: C.navy, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'public', label: 'Public View' },
    { id: 'wallet', label: 'Wallet'      },
    { id: 'items',  label: 'My Items'    },
  ];

  return (
    <div style={{ background: C.navy, minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-page" style={{ paddingTop: 13, paddingBottom: 13, display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>Profile</div>
        </div>
      </div>

      {/* ── Edit form (full-area overlay when open) ─────── */}
      {editOpen && (
        <EditProfileForm wallet={walletAddress} email={email} onClose={() => setEditOpen(false)} />
      )}

      {/* ── Normal profile view ─────────────────────────── */}
      {!editOpen && (
        <>
          <div className="visby-page" style={{ paddingTop: 20, paddingBottom: 0 }}>

            {/* Avatar + info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: walletAddress ? `linear-gradient(135deg, hsl(${(walletAddress.charCodeAt(0)*7)%360},70%,55%), hsl(${(walletAddress.charCodeAt(4)*13)%360},70%,45%))` : GD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff' }}>
                  {initial}
                </div>
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--glass-bg-strong)', border: '2px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{displayName}</div>
                  <button onClick={() => setEditOpen(o => !o)}
                    style={{ width: 28, height: 28, borderRadius: 8, background: editOpen ? 'var(--glass-bg-strong)' : 'var(--glass-bg)', border: `1px solid ${editOpen ? 'var(--glass-border)' : 'var(--glass-border)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={editOpen ? 'var(--text)' : 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
                {profile?.bio && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.bio}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Verified</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Items Owned', value: ownedItems.length },
                { label: 'Listed',      value: listedCount },
                { label: 'Sold',        value: soldItems.length },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '14px 12px', textAlign: 'center', boxShadow: 'var(--glass-shadow), var(--glass-inner)' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tab slider */}
            <div style={{ background: 'var(--glass-bg)', borderRadius: 16, padding: 4, display: 'flex', gap: 4, overflow: 'hidden' }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ flex: 1, background: tab === t.id ? GH : 'none', border: 'none', borderRadius: 12, padding: '10px 4px', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", fontSize: 12, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? '#fff' : 'var(--text-muted)', transition: 'all .15s' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="visby-page" style={{ paddingBottom: 100 }}>
            <div style={{
              background: 'var(--glass-bg-strong)',
              backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
              WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--glass-shadow), var(--glass-inner)',
              padding: 20,
              marginTop: 16,
            }}>
              {tab === 'wallet' && <WalletTab exportWallet={exportWallet} logout={logout} />}
              {tab === 'items'  && <MyItemsTab wallet={walletAddress} />}
              {tab === 'public' && <PublicViewTab wallet={walletAddress} displayName={displayName} bio={profile?.bio} />}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}
