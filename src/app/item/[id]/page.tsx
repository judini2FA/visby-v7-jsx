'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';
import CheckoutModal from '@/components/checkout-modal';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const CAT_BG: Record<string, string> = {
  Sneakers: 'var(--glass-hairline)', Watches: 'var(--glass-hairline)', Bags: 'var(--glass-hairline)',
  Memorabilia: 'var(--glass-hairline)', Vintage: 'var(--glass-hairline)', Electronics: 'var(--glass-hairline)', Other: 'var(--glass-hairline)',
};

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)   return 'just now';
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface OwnershipRecord {
  id: string; owner_wallet: string; from_wallet?: string;
  tx_hash: string; event_type: 'mint' | 'transfer'; price_usdc?: number; created_at: string;
}
interface Item {
  id: string; name: string; serial_number: string; condition: string;
  category: string; description?: string; image_url?: string;
  nft_mint_address: string; current_owner_wallet: string;
  is_listed: boolean; price_usdc?: number; created_at: string;
  ownership_history?: OwnershipRecord[];
}

export default function ItemPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user }   = usePrivy();
  const { address: walletAddress, ready: walletReady } = useVisbWallet();
  const [item, setItem]       = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [listPrice, setListPrice]       = useState('');
  const [listStatus, setListStatus]     = useState<'idle' | 'listing' | 'done'>('idle');
  const [unlistStatus, setUnlistStatus] = useState<'idle' | 'unlisting'>('idle');
  const [editingPrice, setEditingPrice] = useState(false);
  const [buyStatus,  setBuyStatus]      = useState<'idle' | 'done'>('idle');
  const [showDesc, setShowDesc]       = useState(false);
  const [copiedTx, setCopiedTx]       = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  useEffect(() => {
    try { setPrivateMode(localStorage.getItem('visby-private-mode') === '1'); } catch {}
  }, []);

  const copyTx = useCallback((tx: string) => {
    navigator.clipboard.writeText(tx).then(() => {
      setCopiedTx(tx);
      setTimeout(() => setCopiedTx(null), 1500);
    });
  }, []);

  const isOwner = !!(walletAddress && item?.current_owner_wallet === walletAddress);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/item/${id}`)
      .then(async r => {
        const text = await r.text();
        try { return JSON.parse(text); }
        catch { throw new Error(`Server error (${r.status}): ${text.slice(0, 120)}`); }
      })
      .then(d => { if (d.error) setErr(d.error); else setItem(d); })
      .catch((e: any) => setErr(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleList(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress || !item) return;
    setListStatus('listing');
    try {
      const res = await fetch('/api/listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: item.serial_number, price_usdc: parseFloat(listPrice), seller_wallet: walletAddress }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to list item');
      setItem(prev => prev ? { ...prev, is_listed: true, price_usdc: parseFloat(listPrice) } : prev);
      setListStatus('done');
      setEditingPrice(false);
      setTimeout(() => setListStatus('idle'), 2500);
    } catch (err: any) {
      console.error('[handleList]', err);
      alert(err.message || 'Failed to list item');
      setListStatus('idle');
    }
  }

  async function handleUnlist() {
    if (!walletAddress || !item) return;
    setUnlistStatus('unlisting');
    const res = await fetch('/api/listing', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: item.serial_number, seller_wallet: walletAddress }),
    });
    if (res.ok) {
      setItem(prev => prev ? { ...prev, is_listed: false, price_usdc: undefined } : prev);
      setListStatus('idle');
      setEditingPrice(false);
      setListPrice('');
    }
    setUnlistStatus('idle');
  }

  if (loading) return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (err || !item) return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: 14, color: C.red }}>{err || 'Item not found'}</div>
      <Link href="/" style={{ color: 'var(--text-strong)', fontSize: 13 }}>Browse marketplace</Link>
    </div>
  );

  const imageBg = CAT_BG[item.category] ?? CAT_BG.Other;
  const sellerDisplay = shortAddr(item.current_owner_wallet);
  const sellerInitial = (item.current_owner_wallet[0] ?? '?').toUpperCase();
  const history = item.ownership_history ?? [];

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: 13, paddingBottom: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/marketplace" style={{ display: 'flex', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        </div>
      </div>

      {/* Hero image — full width up to page container */}
      <div className="visby-inner" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div style={{ background: imageBg, width: '100%', height: 360, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{item.category}</div>
          )}
          {/* Condition badge */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', border: '1px solid rgba(255,255,255,.1)' }}>
            {(item as any).transfer_count > 0 ? 'Used' : item.condition}
          </div>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingBottom: 120 }}>

        {/* Name + category */}
        <div style={{ paddingTop: 18, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontFamily: "'Manrope',sans-serif", color: 'var(--text-strong)', background: 'var(--glass-bg)', borderRadius: 6, padding: '3px 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.category}</span>
            {isOwner && <span style={{ fontSize: 10, fontFamily: "'Manrope',sans-serif", color: 'var(--text-strong)', background: 'var(--glass-bg)', borderRadius: 6, padding: '3px 8px' }}>YOU OWN THIS</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.25, margin: 0 }}>{item.name}</h1>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><title>Name is locked at mint</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Manrope',sans-serif", marginTop: 6 }}>
            {isOwner
              ? `SN: ${item.serial_number}`
              : <span>SN: <span style={{ letterSpacing: '0.1em' }}>••••••••</span> <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>· visible to owner</span></span>
            }
          </div>
        </div>

        {/* Price + buy/owner controls */}
        <div style={{ padding: '18px 0', borderBottom: `1px solid ${C.border}` }}>

          {/* Wait for wallet before deciding owner vs buyer view */}
          {!walletReady ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
              <span style={{ fontSize: 13, color: C.muted }}>Loading wallet…</span>
            </div>
          ) : isOwner ? (
            item.is_listed && item.price_usdc && !editingPrice ? (
              /* Listed — show controls */
              <div>
                <div style={{ fontSize: 32, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>
                  ${item.price_usdc.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Manrope',sans-serif", marginBottom: 18, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
                  LISTED FOR SALE · USDC
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setEditingPrice(true); setListPrice(String(item.price_usdc ?? '')); }}
                    style={{ flex: 1, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '13px', fontWeight: 700, fontSize: 14, color: 'var(--text-strong)', cursor: 'pointer', fontFamily: "'Manrope',sans-serif" }}>
                    Edit Price
                  </button>
                  <button onClick={handleUnlist} disabled={unlistStatus === 'unlisting'}
                    style={{ flex: 1, background: 'rgba(255,59,92,.1)', border: '1px solid rgba(255,59,92,.25)', borderRadius: 16, padding: '13px', fontWeight: 700, fontSize: 14, color: C.red, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", opacity: unlistStatus === 'unlisting' ? 0.6 : 1 }}>
                    {unlistStatus === 'unlisting' ? 'Removing…' : 'Unlist'}
                  </button>
                </div>
              </div>
            ) : (
              /* Not listed or editing price — show list/update form */
              listStatus === 'done' ? (
                <div style={{ fontSize: 14, color: C.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {editingPrice ? 'Price updated!' : 'Listed successfully!'}
                </div>
              ) : (
                <form onSubmit={handleList}>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 20, fontWeight: 800, color: 'var(--text-muted)' }}>$</div>
                    <input type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="0.00" required min="0.01" step="0.01"
                      style={{ width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '15px 60px 15px 34px', color: 'var(--text)', fontSize: 20, fontWeight: 800, outline: 'none', fontFamily: "'Manrope',sans-serif", boxSizing: 'border-box' }} />
                    <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.muted, fontFamily: "'Manrope',sans-serif" }}>USDC</div>
                  </div>
                  <button type="submit" disabled={listStatus === 'listing'}
                    style={{ width: '100%', background: listStatus === 'listing' ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: listStatus === 'listing' ? 'not-allowed' : 'pointer', fontFamily: "'Manrope',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    {listStatus === 'listing' ? (
                      <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} /> Listing…</>
                    ) : editingPrice ? `Update Price${listPrice ? ` · $${parseFloat(listPrice).toFixed(2)}` : ''}` : `List Now${listPrice ? ` · $${parseFloat(listPrice).toFixed(2)}` : ''}`}
                  </button>
                  {editingPrice && (
                    <button type="button" onClick={() => setEditingPrice(false)}
                      style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', padding: '8px', fontWeight: 600, fontSize: 13, color: C.muted, cursor: 'pointer', fontFamily: "'Manrope',sans-serif" }}>
                      Cancel
                    </button>
                  )}
                </form>
              )
            )
          ) : (
            /* ── BUYER VIEW ── */
            item.is_listed && item.price_usdc ? (
              <>
                <div style={{ fontSize: 32, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>
                  ${item.price_usdc.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Manrope',sans-serif", marginBottom: 18 }}>USDC · Solana</div>

                {walletAddress && buyStatus === 'done' ? (
                  <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}44`, borderRadius: 16, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontSize: 15, fontWeight: 700, color: C.green }}>Purchase complete!</span>
                    </div>
                  </div>
                ) : walletAddress ? (
                  <button onClick={() => setShowCheckout(true)}
                    style={{ width: '100%', background: GH, border: 'none', borderRadius: 16, padding: '15px 20px', fontWeight: 800, fontSize: 16, color: '#fff', cursor: 'pointer', fontFamily: "'Manrope',sans-serif" }}>
                    Buy Now · ${item.price_usdc.toFixed(2)}
                  </button>
                ) : (
                  <Link href="/login" style={{ display: 'block', textAlign: 'center', background: GH, borderRadius: 16, padding: '16px 20px', fontWeight: 800, fontSize: 17, color: '#fff', textDecoration: 'none' }}>
                    Sign In to Buy
                  </Link>
                )}
              </>
            ) : (
              <div style={{ fontSize: 14, color: C.muted }}>Not listed for sale</div>
            )
          )}
        </div>

        {/* Seller */}
        <div style={{ padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Manrope',sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Seller</div>
          <div style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
            WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--r)',
            boxShadow: 'var(--glass-shadow), var(--glass-inner)',
            padding: 16,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: GH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {sellerInitial}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {sellerDisplay}
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Manrope',sans-serif", marginTop: 2 }}>Verified · Solana</div>
              </div>
            </div>
          </div>
          {!isOwner && !privateMode && (
            <Link href={`/dashboard?msg=${item.current_owner_wallet}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
                WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
                border: '1px solid var(--glass-border)',
                borderRadius: 20,
                padding: '10px 18px',
                fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
                textDecoration: 'none', width: '100%', justifyContent: 'center',
                boxShadow: 'var(--glass-inner)',
                marginTop: 8,
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Message Seller
            </Link>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <div style={{ padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
            <button onClick={() => setShowDesc(s => !s)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Description</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ transform: showDesc ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showDesc && <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.75, marginTop: 12 }}>{item.description}</div>}
          </div>
        )}

        {/* NFT / provenance */}
        <div style={{ padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Manrope',sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>NFT Provenance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 20, boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Manrope',sans-serif", marginBottom: 3 }}>Mint address</div>
              <div style={{ fontSize: 11, color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif", wordBreak: 'break-all' }}>{item.nft_mint_address || '—'}</div>
            </div>
            {item.nft_mint_address && (
              <a href={`https://explorer.solana.com/address/${item.nft_mint_address}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: "'Manrope',sans-serif" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                View on Solana Explorer
              </a>
            )}
          </div>
        </div>

        {/* Ownership history */}
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Manrope',sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>Provenance Chain</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Manrope',sans-serif" }}>{history.length} event{history.length !== 1 ? 's' : ''}</div>
          </div>
          {(item as any).transfer_count > 0 && (
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Minted as: {item.condition}
            </div>
          )}
          {history.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No history yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 24, boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: 18 }}>
              {history.map((r, i) => {
                const isMint    = r.event_type === 'mint';
                const isLatest  = i === history.length - 1;
                const accentCol = 'var(--text-muted)';
                const fullDate  = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const fullTime  = new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const shortTx   = r.tx_hash ? `${r.tx_hash.slice(0,8)}…${r.tx_hash.slice(-8)}` : '';

                return (
                  <div key={r.id} style={{ display: 'flex', gap: 14, paddingBottom: i < history.length - 1 ? 20 : 0 }}>

                    {/* Timeline spine */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--glass-bg)', border: `2px solid var(--glass-border)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                        {isMint
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accentCol} strokeWidth="2.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accentCol} strokeWidth="2.5" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                        }
                        {isLatest && (
                          <div style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--text-muted)', border: '2px solid var(--glass-hairline)' }} />
                        )}
                      </div>
                      {i < history.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 20, background: 'var(--divider)', marginTop: 4 }} />}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, paddingTop: 4 }}>

                      {/* Row 1: event label + date */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
                            {isMint
                              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ marginRight: 4, verticalAlign: 'middle' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Minted</>
                              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 4, verticalAlign: 'middle' }}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>Transferred</>
                            }
                          </span>
                          {r.price_usdc && (
                            <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: "'Manrope',sans-serif" }}>
                              ${r.price_usdc.toFixed(2)} USDC
                            </span>
                          )}
                          {isLatest && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-strong)', background: 'var(--glass-bg)', borderRadius: 4, padding: '2px 6px', fontFamily: "'Manrope',sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              Current
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Manrope',sans-serif" }}>{timeAgo(r.created_at)}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Manrope',sans-serif", marginTop: 1 }}>{fullDate} {fullTime}</div>
                        </div>
                      </div>

                      {/* Row 2: wallet(s) */}
                      {r.from_wallet ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                          <Link href={`/p/${r.from_wallet}`} style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: `linear-gradient(135deg,${C.blue},${C.mag})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                              {r.from_wallet[0]?.toUpperCase()}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Manrope',sans-serif" }}>{shortAddr(r.from_wallet)}</span>
                          </Link>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                          <Link href={`/p/${r.owner_wallet}`} style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: `linear-gradient(135deg,${C.teal},${C.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                              {r.owner_wallet[0]?.toUpperCase()}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: "'Manrope',sans-serif" }}>{shortAddr(r.owner_wallet)}</span>
                          </Link>
                        </div>
                      ) : (
                        <div style={{ marginBottom: 6 }}>
                          <Link href={`/p/${r.owner_wallet}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: `linear-gradient(135deg,${C.teal},${C.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                              {r.owner_wallet[0]?.toUpperCase()}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: "'Manrope',sans-serif" }}>{shortAddr(r.owner_wallet)}</span>
                          </Link>
                        </div>
                      )}

                      {/* Row 3: TX hash */}
                      {r.tx_hash && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <a href={`https://explorer.solana.com/tx/${r.tx_hash}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Manrope',sans-serif", textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            {shortTx}
                          </a>
                          <button onClick={() => copyTx(r.tx_hash)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', transition: 'opacity .15s', opacity: copiedTx === r.tx_hash ? 1 : 0.4 }}>
                            {copiedTx === r.tx_hash
                              ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                              : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            }
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showCheckout && item && walletAddress && (
        <CheckoutModal
          itemId={item.id}
          itemName={item.name}
          priceUsdc={item.price_usdc!}
          buyerWallet={walletAddress}
          onClose={() => setShowCheckout(false)}
          onSuccess={(purchasedItemId) => {
            setShowCheckout(false);
            router.push(`/order/${purchasedItemId}`);
          }}
        />
      )}
    </div>
  );
}
