'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, btn, surface, input } from '@/lib/ui';
import { trpc } from '@/lib/trpc/client';

// Cross-chain wallet registry + Tally Destination picker. Persists to the profile (server) with a
// localStorage cache. Solana transfers + mint-to-destination are live; ETH/BTC receiving is next.
type Chain = 'solana' | 'ethereum' | 'bitcoin';
type Wallet = { id: string; chain: Chain; address: string; label?: string };

const CHAINS: Record<Chain, { label: string; abbr: string; grad: string }> = {
  solana:   { label: 'Solana',   abbr: 'SOL', grad: 'linear-gradient(135deg,#14F195,#9945FF)' },
  ethereum: { label: 'Ethereum', abbr: 'ETH', grad: 'linear-gradient(135deg,#6B8AFF,#454A75)' },
  bitcoin:  { label: 'Bitcoin',  abbr: 'BTC', grad: 'linear-gradient(135deg,#F7931A,#FFC06B)' },
};

function short(a: string) { return a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-5)}` : a; }

function ChainBadge({ chain, size = 34 }: { chain: Chain; size?: number }) {
  const c = CHAINS[chain];
  return (
    <span style={{ width: size, height: size, borderRadius: 9, background: c.grad, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.02em', fontFamily: "'Manrope',sans-serif" }}>
      {c.abbr}
    </span>
  );
}

export function TallyWallets({ visbyWallet }: { visbyWallet: string }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [dest, setDest] = useState('');           // chosen destination address; '' = Visby wallet
  const [addChain, setAddChain] = useState<Chain>('ethereum');
  const [addAddr, setAddAddr] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const upsert = trpc.profiles.upsertProfile.useMutation();
  const { getAccessToken } = usePrivy();

  useEffect(() => {
    try {
      setWallets(JSON.parse(localStorage.getItem('visby-connected-wallets') || '[]'));
      setDest(localStorage.getItem('visby-tally-wallet') || '');
    } catch {}
  }, []);

  // Server is the source of truth once migrated — adopt it (cross-device sync). These are private fields,
  // so read them from the AUTHED route (the public getProfile no longer exposes them).
  useEffect(() => {
    if (!visbyWallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/profile/private?wallet=${encodeURIComponent(visbyWallet)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled) return;
        if (Array.isArray(d.connected_wallets) && d.connected_wallets.length) { setWallets(d.connected_wallets); try { localStorage.setItem('visby-connected-wallets', JSON.stringify(d.connected_wallets)); } catch {} }
        if (typeof d.tally_wallet === 'string' && d.tally_wallet) { setDest(d.tally_wallet); try { localStorage.setItem('visby-tally-wallet', d.tally_wallet); } catch {} }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [visbyWallet, getAccessToken]);

  const persist = (ws: Wallet[]) => {
    setWallets(ws);
    try { localStorage.setItem('visby-connected-wallets', JSON.stringify(ws)); } catch {}
    if (visbyWallet) upsert.mutate({ wallet: visbyWallet, connected_wallets: ws });
  };
  const setDestination = (addr: string) => {
    setDest(addr);
    try { addr ? localStorage.setItem('visby-tally-wallet', addr) : localStorage.removeItem('visby-tally-wallet'); } catch {}
    if (visbyWallet) upsert.mutate({ wallet: visbyWallet, tally_wallet: addr });
  };

  function add() {
    const a = addAddr.trim();
    if (!a) return;
    persist([...wallets, { id: a + '-' + wallets.length, chain: addChain, address: a, label: addLabel.trim() || undefined }]);
    setAddAddr(''); setAddLabel(''); setAdding(false);
  }
  function remove(w: Wallet) {
    persist(wallets.filter(x => x.id !== w.id));
    if (dest === w.address) setDestination('');
  }

  const all: Wallet[] = [{ id: 'visby', chain: 'solana', address: visbyWallet, label: 'Visby wallet' }, ...wallets];
  const destAddr = dest || visbyWallet;

  return (
    <div>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>Tally Destination</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>
        Connect wallets across chains and choose where new Tallys are kept.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        {all.map(w => {
          const isDest = w.address === destAddr;
          return (
            <div key={w.id} style={{ ...surface({ pad: '12px 14px' }), display: 'flex', alignItems: 'center', gap: S[3], border: isDest ? '1.5px solid var(--text-strong)' : undefined }}>
              <ChainBadge chain={w.chain} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...t('body'), fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.label || CHAINS[w.chain].label}
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {short(w.address)}{w.id === 'visby' ? ' · default' : ''}
                </div>
              </div>
              {isDest ? (
                <span style={{ ...t('micro'), color: 'var(--text-strong)', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.9 5.7 21 8 14 2 9.4h7.6z"/></svg>
                  Destination
                </span>
              ) : (
                <button onClick={() => setDestination(w.id === 'visby' ? '' : w.address)}
                  style={{ ...t('micro'), color: 'var(--text-muted)', background: 'none', border: 0, cursor: 'pointer', flexShrink: 0 }}>
                  Set
                </button>
              )}
              {w.id !== 'visby' && (
                <button onClick={() => remove(w)} aria-label="Remove wallet"
                  style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0, display: 'inline-flex' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <div style={{ ...surface({ pad: S[4] }), marginTop: S[3], display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div style={{ display: 'flex', gap: S[2] }}>
            {(Object.keys(CHAINS) as Chain[]).map(c => (
              <button key={c} onClick={() => setAddChain(c)}
                style={{ ...btn(addChain === c ? 'primary' : 'secondary'), padding: '7px 12px', fontSize: 12, flex: 1, ...(addChain === c ? {} : { color: 'var(--text-muted)' }) }}>
                {CHAINS[c].label}
              </button>
            ))}
          </div>
          <input value={addAddr} onChange={e => setAddAddr(e.target.value)} placeholder={`${CHAINS[addChain].label} wallet address`} style={input()} />
          <input value={addLabel} onChange={e => setAddLabel(e.target.value)} placeholder="Label (optional)" style={input()} />
          <div style={{ display: 'flex', gap: S[2] }}>
            <button onClick={add} disabled={!addAddr.trim()} style={{ ...btn('primary', { full: true, pill: false }), flex: 1, opacity: addAddr.trim() ? 1 : 0.5 }}>Add wallet</button>
            <button onClick={() => { setAdding(false); setAddAddr(''); setAddLabel(''); }} style={{ ...btn('secondary', { pill: false }) }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...t('body'), fontWeight: 700, color: 'var(--text-strong)', background: 'none', border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: S[2], marginTop: S[3], padding: `${S[2]}px 0` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add a wallet
        </button>
      )}

      <div style={{ ...t('micro'), color: 'var(--text-muted)', marginTop: S[4], lineHeight: 1.5 }}>
        Transfers between your Solana wallets are live. Ethereum &amp; Bitcoin receiving is rolling out.
      </div>
    </div>
  );
}
