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

// Reject addresses that aren't valid for the chosen chain, so a typo / fake address can't be saved as a
// destination. Format-only (we can't prove an address is "owned") — but it stops obviously-invalid input.
function validateAddress(chain: Chain, addr: string): string | null {
  const a = addr.trim();
  if (!a) return 'Enter a wallet address.';
  if (chain === 'solana') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) ? null : 'That isn’t a valid Solana address.';
  }
  if (chain === 'ethereum') {
    return /^0x[a-fA-F0-9]{40}$/.test(a) ? null : 'That isn’t a valid Ethereum address.';
  }
  // bitcoin: legacy base58 (1/3…) or bech32 (bc1…)
  if (/^[13][1-9A-HJ-NP-Za-km-z]{25,39}$/.test(a) || /^bc1[0-9ac-hj-np-z]{11,71}$/.test(a)) return null;
  return 'That isn’t a valid Bitcoin address.';
}

function ChainBadge({ chain, size = 34 }: { chain: Chain; size?: number }) {
  const c = CHAINS[chain];
  return (
    <span style={{ width: size, height: size, borderRadius: 9, background: c.grad, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.02em', fontFamily: "'Manrope',sans-serif" }}>
      {c.abbr}
    </span>
  );
}

function DragGrip() {
  return (
    <svg width="11" height="18" viewBox="0 0 12 20" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
      {[4, 10, 16].map(y => [3, 9].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}
    </svg>
  );
}

export function TallyWallets({ visbyWallet }: { visbyWallet: string }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [dest, setDest] = useState('');           // chosen destination address; '' = Visby wallet
  const [addChain, setAddChain] = useState<Chain>('ethereum');
  const [addAddr, setAddAddr] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState('');
  const [openMenu, setOpenMenu] = useState('');

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
    const err = validateAddress(addChain, a);
    if (err) { setAddErr(err); return; }
    if (wallets.some(w => w.address === a) || a === visbyWallet) { setAddErr('That wallet is already added.'); return; }
    setAddErr('');
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }} onClick={() => openMenu && setOpenMenu('')}>
        {(() => {
          const destWallet = all.find(w => w.address === destAddr) ?? all[0];
          const ordered = [destWallet, ...all.filter(w => w.address !== destWallet.address)];
          return ordered.map(w => {
            const isDest = w.address === destAddr;
            const isVisby = w.id === 'visby';
            const tileBody = (
              <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                <span style={{ color: 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}><DragGrip /></span>
                <ChainBadge chain={w.chain} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('body'), fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.label || CHAINS[w.chain].label}</div>
                  <div style={{ ...t('micro'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short(w.address)}{isVisby ? ' · default' : ''}</div>
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setOpenMenu(openMenu === w.id ? '' : w.id)} aria-label="Wallet options" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'inline-flex' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
                  </button>
                  {openMenu === w.id && (
                    <div style={{ position: 'absolute', top: 30, right: 0, zIndex: 20, minWidth: 160, ...surface({ pad: '6px' }), background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', display: 'flex', flexDirection: 'column' }}>
                      {!isDest && <button onClick={() => { setDestination(isVisby ? '' : w.address); setOpenMenu(''); }} style={{ ...t('body'), color: 'var(--text)', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: '9px 12px', borderRadius: 'var(--r-sm)' }}>Set as destination</button>}
                      {isDest && <div style={{ ...t('meta'), color: 'var(--text-muted)', padding: '9px 12px' }}>Current destination</div>}
                      {!isVisby && <button onClick={() => { remove(w); setOpenMenu(''); }} style={{ ...t('body'), color: 'var(--danger)', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: '9px 12px', borderRadius: 'var(--r-sm)' }}>Remove</button>}
                    </div>
                  )}
                </div>
              </div>
            );
            return isDest ? (
              <div key={w.id} style={{ position: 'relative', borderRadius: 'var(--r-lg)', background: 'var(--grad-brand)', padding: '20px 3px 3px', boxShadow: '0 6px 20px rgba(120,110,160,.20)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', ...t('micro'), color: 'var(--text-on-cta)', letterSpacing: '0.16em', pointerEvents: 'none' }}>DESTINATION</div>
                <div style={{ background: 'var(--surface-bg)', borderRadius: 'var(--r)', padding: '10px 12px' }}>{tileBody}</div>
              </div>
            ) : (
              <div key={w.id} style={{ ...surface({ pad: '10px 12px' }) }}>{tileBody}</div>
            );
          });
        })()}
      </div>

      {adding ? (
        <div style={{ ...surface({ pad: S[4] }), marginTop: S[3], display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div style={{ display: 'flex', gap: S[2] }}>
            {(Object.keys(CHAINS) as Chain[]).map(c => (
              <button key={c} onClick={() => { setAddChain(c); setAddErr(''); }}
                style={{ ...btn(addChain === c ? 'primary' : 'secondary'), padding: '7px 12px', fontSize: 12, flex: 1, ...(addChain === c ? {} : { color: 'var(--text-muted)' }) }}>
                {CHAINS[c].label}
              </button>
            ))}
          </div>
          <input value={addAddr} onChange={e => { setAddAddr(e.target.value); if (addErr) setAddErr(''); }} placeholder={`${CHAINS[addChain].label} wallet address`} style={input()} />
          {addErr && <div style={{ ...t('micro'), color: 'var(--danger)' }}>{addErr}</div>}
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
