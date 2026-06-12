'use client';

import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { ThemeToggle, useTheme } from '@/lib/theme';
import { t, S, price, card, surface, btn, badge, avatar, input, sectionLabel, tabSlider, T } from '@/lib/ui';

const C = {
  navy: 'transparent', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C', border: 'var(--glass-border)',
};
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

  return (
    <div style={{ borderTop: '1px solid var(--divider)', paddingTop: S[5], marginTop: S[2] }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>Payout Settings</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>
        Choose how you receive payment when an item sells.
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
          {(['crypto', 'bank'] as const).map(pt => (
            <button key={pt} type="button" onClick={() => setPayoutType(pt)}
              style={{ ...surface({ pad: '14px 12px' }), borderColor: payoutType === pt ? 'var(--text-strong)' : 'var(--glass-hairline)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ ...t('body'), fontWeight: 700, color: 'var(--text-strong)', marginBottom: S[1] }}>
                {pt === 'crypto' ? 'Crypto wallet' : 'Bank account'}
              </div>
              <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                {pt === 'crypto' ? 'SOL/USDC · instant' : 'via Stripe · 2–7 days'}
              </div>
            </button>
          ))}
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
          </>
        )}

        {payoutType === 'bank' && (
          <div>
            <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Stripe Connect account ID</div>
            <input value={stripeAccountId} onChange={e => setStripeAccountId(e.target.value)} placeholder="acct_1ABC123…" style={input()} />
          </div>
        )}

        {errMsg && <div style={{ ...surface({ pad: '10px 14px' }), ...t('body'), color: C.red, borderColor: 'rgba(255,59,92,.2)' }}>{errMsg}</div>}

        <button type="submit" disabled={status === 'saving'}
          style={{ ...btn(status === 'saved' ? 'secondary' : 'primary', { full: true }), opacity: status === 'saving' ? 0.7 : 1, cursor: status === 'saving' ? 'not-allowed' : 'pointer', color: status === 'saved' ? C.green : undefined }}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save Payout Settings'}
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
    <div style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[3] }}>
      <div style={{ ...surface({ radius: 'var(--r-sm)' }), width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
        <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>Appearance</span>
        <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{mode === 'dark' ? 'Night' : 'Day'} mode</span>
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
    <div style={{ paddingTop: S[4] }}>
      {/* SOL balance card */}
      <div style={{ ...surface({ pad: S[5] }), marginBottom: S[4], textAlign: 'center' }}>
        <div style={{ ...sectionLabel(), marginBottom: S[4] }}>
          Solana Wallet
        </div>
        {solAddress ? (
          <>
            <div style={{ ...price('lg'), fontSize: 42, margin: '0 auto 4px' }}>
              {balanceDisplay}
            </div>
            <div style={{ ...t('heading'), color: 'var(--text-muted)', marginBottom: S[3] }}>SOL</div>
            {balance === 0 && !balanceLoading && (
              <div style={{ ...surface({ pad: '10px 14px' }), ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>
                Get free SOL at{' '}
                <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" style={{ color: 'var(--text-strong)', textDecoration: 'none', fontWeight: 700 }}>faucet.solana.com</a>
                {' '}→ paste your address below
              </div>
            )}
            <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[5], wordBreak: 'break-all', padding: '0 8px', cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(solAddress)} title="Click to copy">
              {solAddress}
            </div>
          </>
        ) : (
          <>
            <div style={{ ...t('body'), color: 'var(--text-muted)', marginBottom: S[5] }}>No Solana wallet yet</div>
            <button onClick={async () => { setCreating(true); try { await createSolanaWallet(); } catch {} setCreating(false); }}
              disabled={creating}
              style={{ ...btn('primary'), marginBottom: S[5], opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Creating…' : 'Create Solana Wallet'}
            </button>
          </>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: S[3], justifyContent: 'center' }}>
          <Link href="/dashboard/seller" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2] }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: T.gradBrand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <span style={{ ...t('meta'), color: 'var(--text)' }}>Mint</span>
          </Link>
          <div onClick={() => exportWallet()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2], cursor: 'pointer' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: T.gradBrand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <span style={{ ...t('meta'), color: 'var(--text)' }}>Export</span>
          </div>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2] }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: T.gradBrand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            </div>
            <span style={{ ...t('meta'), color: 'var(--text)' }}>Shop</span>
          </Link>
        </div>
      </div>

      {/* Payment methods */}
      <div style={{ marginBottom: S[3] }}>
        <div style={{ ...sectionLabel(), marginBottom: S[3] }}>Payment Methods</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <div style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${C.green}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...t('body'), fontWeight: 700, color: 'var(--text-strong)' }}>Card via Stripe</div>
              <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Pay with any credit or debit card</div>
            </div>
            <span style={badge('success')}>ACTIVE</span>
          </div>
          <div style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...t('body'), fontWeight: 700, color: 'var(--text-muted)' }}>Crypto (SOL, ETH, BTC)</div>
            </div>
            <span style={badge('default')}>SOON</span>
          </div>
        </div>
      </div>

      {/* Wallet security */}
      <div style={{ marginBottom: S[3] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[3] }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <div style={sectionLabel()}>Wallet Security</div>
        </div>
        <button onClick={() => exportWallet()} style={{ ...btn('primary', { full: true }), marginBottom: S[3] }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export Private Key
        </button>
        <div style={surface({ pad: S[4] })}>
          <div style={{ ...t('body'), color: 'var(--text)', lineHeight: 1.7 }}>
            Your key is split across secure servers. Export your private key anytime to import into Phantom or Solflare.
          </div>
        </div>
      </div>

      {/* Appearance */}
      <AppearanceRow />

      {/* Payout settings */}
      <PayoutSection wallet={wallet} />

      {/* Sign out */}
      <button onClick={logout} style={{ ...btn('danger', { full: true }), marginTop: S[5] }}>
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
    <div style={{ paddingTop: S[4], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, background: 'var(--surface-bg)', borderRadius: 'var(--r-sm)', animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (ownedItems.length === 0) return (
    <div style={{ paddingTop: S[6], textAlign: 'center' }}>
      <div style={{ ...surface({ pad: '40px 20px' }) }}>
        <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>No items yet</div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[5] }}>Mint your first item to see it here</div>
        <Link href="/dashboard/seller" style={btn('primary')}>
          Mint First Item
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ paddingTop: S[4], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {ownedItems.map((item: any) => (
        <Link key={item.id} href={`/item/${item.id}`}
          style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3], textDecoration: 'none' }}>
          <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--surface-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {item.image_url
              ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category?.slice(0,3)}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>{item.condition} · {item.category}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {item.is_listed && item.price_usdc ? (
              <div style={price('sm')}>${item.price_usdc}</div>
            ) : (
              <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>NOT LISTED</div>
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
    <div style={{ paddingTop: S[4] }}>
      {/* Preview banner */}
      <div style={{ ...surface({ pad: '12px 16px' }), marginBottom: S[5], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Viewing as others see you</div>
        <Link href={`/p/${wallet}`} style={{ ...t('meta'), fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none' }}>Open full page →</Link>
      </div>

      {/* Avatar card */}
      <div style={{ ...surface({ pad: S[4] }), display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[5] }}>
        <div style={{ ...avatar('md'), width: 56, height: 56, fontSize: 20, background: wallet ? `linear-gradient(135deg, hsl(${(wallet.charCodeAt(0)*7)%360},70%,55%), hsl(${(wallet.charCodeAt(4)*13)%360},70%,45%))` : GD }}>
          {(displayName[0] ?? '?').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>{displayName}</div>
          {bio && <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[1] }}>{bio}</div>}
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{shortAddr(wallet)}</div>
        </div>
      </div>

      {/* Active listings preview */}
      {listedItems.length > 0 && (
        <>
          <div style={{ ...sectionLabel(), marginBottom: S[3] }}>
            {listedItems.length} active listing{listedItems.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
            {listedItems.slice(0, 4).map((item: any) => (
              <Link key={item.id} href={`/item/${item.id}`}
                style={{ ...surface({ radius: 'var(--r)' }), display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none' }}>
                <div style={{ aspectRatio: '1 / 1', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</span>
                  }
                </div>
                <div style={{ padding: S[3], display: 'flex', flexDirection: 'column', gap: S[1] }}>
                  <div style={{ ...t('body'), fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={price('sm')}>${item.price_usdc}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {listedItems.length === 0 && (
        <div style={{ ...t('body'), textAlign: 'center', padding: `${S[6]}px 0`, color: 'var(--text-muted)' }}>
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

  return (
    <div style={{ padding: `0 ${S[4]}px ${S[7]}px`, maxWidth: 600, margin: '0 auto' }}>

      {/* Preview */}
      <div style={{ ...card({ pad: S[4] }), display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[5] }}>
        <div style={{ ...avatar('md'), background: wallet ? `linear-gradient(135deg, hsl(${(wallet.charCodeAt(0)*7)%360},70%,55%), hsl(${(wallet.charCodeAt(4)*13)%360},70%,45%))` : GD }}>
          {wallet.slice(0,2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>
            {displayName || wallet.slice(0,6) + '…' + wallet.slice(-4)}
          </div>
          {displayBio && <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayBio}</div>}
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{email ?? shortAddr(wallet)}</div>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Display Name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={existing?.display_name ?? 'e.g. sneaker.vault'} maxLength={40} style={input()} />
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>Shown instead of your wallet address</div>
        </div>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Bio</div>
          <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder={existing?.bio ?? 'What do you sell?'} maxLength={200} rows={3}
            style={{ ...input(), resize: 'vertical', lineHeight: 1.6 }} />
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1], textAlign: 'right' }}>{bio.length}/200</div>
        </div>
        <div style={surface({ pad: '12px 16px' })}>
          <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Wallet (read-only)</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)', wordBreak: 'break-all' }}>{wallet}</div>
        </div>
        {email && (
          <div style={surface({ pad: '12px 16px' })}>
            <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Email (read-only)</div>
            <div style={{ ...t('body'), color: 'var(--text-muted)' }}>{email}</div>
          </div>
        )}
        {upsert.isError && (
          <div style={{ ...surface({ pad: '10px 14px' }), ...t('meta'), color: C.red, borderColor: 'rgba(255,59,92,.3)' }}>
            Could not save — check your connection and try again.
          </div>
        )}
        <div style={{ display: 'flex', gap: S[2] }}>
          <button type="button" onClick={onClose}
            style={{ ...btn('secondary'), flex: 1 }}>
            Cancel
          </button>
          <button type="submit" disabled={upsert.isPending}
            style={{ ...btn(saved ? 'secondary' : 'primary'), flex: 2, opacity: upsert.isPending ? 0.7 : 1, cursor: upsert.isPending ? 'not-allowed' : 'pointer', color: saved ? C.green : undefined }}>
            {saved ? 'Saved!' : upsert.isPending ? 'Saving…' : 'Save Profile'}
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
  const { data: counts }          = trpc.follows.getCounts.useQuery({ wallet: walletAddress }, { enabled: !!walletAddress });

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
        <div className="visby-page" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center' }}>
          <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Profile</div>
        </div>
      </div>

      {/* ── Edit form (full-area overlay when open) ─────── */}
      {editOpen && (
        <EditProfileForm wallet={walletAddress} email={email} onClose={() => setEditOpen(false)} />
      )}

      {/* ── Normal profile view ─────────────────────────── */}
      {!editOpen && (
        <>
          <div className="visby-page" style={{ paddingTop: S[5], paddingBottom: 0 }}>

            {/* Avatar + info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: S[4], marginBottom: S[5] }}>
              <div style={{ ...avatar('lg'), fontSize: 24, background: walletAddress ? `linear-gradient(135deg, hsl(${(walletAddress.charCodeAt(0)*7)%360},70%,55%), hsl(${(walletAddress.charCodeAt(4)*13)%360},70%,45%))` : GD }}>
                {initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[1] }}>
                  <div style={{ ...t('title'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{displayName}</div>
                  <button onClick={() => setEditOpen(o => !o)}
                    style={{ ...surface({ radius: 8 }), width: 32, height: 32, borderColor: editOpen ? 'var(--text-strong)' : 'var(--glass-hairline)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={editOpen ? 'var(--text)' : 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
                {profile?.bio && (
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.bio}</div>
                )}
              </div>
            </div>

            {/* Social */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2], marginBottom: S[2] }}>
              {([
                { label: 'Followers', value: counts?.followers ?? 0, tab: 'followers' },
                { label: 'Following', value: counts?.following ?? 0, tab: 'following' },
              ] as const).map(s => (
                <Link key={s.label} href={`/connections/${walletAddress}?tab=${s.tab}`}
                  style={{ ...surface({ pad: '14px 12px' }), textAlign: 'center', textDecoration: 'none' }}>
                  <div style={{ ...t('title'), color: 'var(--text-strong)' }}>{s.value}</div>
                  <div style={{ ...t('micro'), color: 'var(--text-muted)', marginTop: S[1] }}>{s.label}</div>
                </Link>
              ))}
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: S[2], marginBottom: S[5] }}>
              {[
                { label: 'Items Owned', value: ownedItems.length },
                { label: 'Listed',      value: listedCount },
                { label: 'Sold',        value: soldItems.length },
              ].map(s => (
                <div key={s.label} style={{ ...surface({ pad: '14px 12px' }), textAlign: 'center' }}>
                  <div style={{ ...t('title'), color: 'var(--text-strong)' }}>{s.value}</div>
                  <div style={{ ...t('micro'), color: 'var(--text-muted)', marginTop: S[1] }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tab slider */}
            <div style={tabSlider().wrap}>
              {TABS.map(tt => (
                <button key={tt.id} onClick={() => setTab(tt.id)}
                  style={{ ...tabSlider().item, ...(tab === tt.id ? tabSlider().itemActive : null) }}>
                  {tt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="visby-page" style={{ paddingBottom: 100 }}>
            <div style={{ ...card({ radius: 'var(--r-xl)', pad: S[4] }), marginTop: S[4] }}>
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
