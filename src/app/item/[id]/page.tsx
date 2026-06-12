'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';
import CheckoutModal from '@/components/checkout-modal';
import { S, t, price, card, btn, badge, avatar, sectionLabel, input } from '@/lib/ui';

const C = {
  navy: 'transparent', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

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
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[4] }}>
      <div style={{ ...t('body'), color: C.red }}>{err || 'Item not found'}</div>
      <Link href="/" style={{ ...btn('secondary') }}>Browse marketplace</Link>
    </div>
  );

  const sellerDisplay = shortAddr(item.current_owner_wallet);
  const sellerInitial = (item.current_owner_wallet[0] ?? '?').toUpperCase();
  const history = item.ownership_history ?? [];

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <Link href="/marketplace" style={{ display: 'flex', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div style={{ ...t('heading'), flex: 1, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        </div>
      </div>

      {/* Hero image — full width up to page container */}
      <div className="visby-inner" style={{ paddingTop: S[4], paddingBottom: 0 }}>
        <div style={{ background: 'var(--surface-bg)', width: '100%', height: 360, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</div>
          )}
          {/* Condition badge */}
          <span style={{ ...badge('onImage'), position: 'absolute', bottom: S[3], left: S[3] }}>
            {(item as any).transfer_count > 0 ? 'Used' : item.condition}
          </span>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingBottom: S[8] + S[7] }}>

        {/* Name + category */}
        <div style={{ paddingTop: S[5], paddingBottom: S[5], borderBottom: `1px solid var(--divider)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[3] }}>
            <span style={{ ...badge('default') }}>{item.category}</span>
            {isOwner && <span style={{ ...badge('default') }}>You own this</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <h1 style={{ ...t('title'), color: 'var(--text-strong)', margin: 0 }}>{item.name}</h1>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><title>Name is locked at mint</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div style={{ ...t('meta'), color: C.muted, marginTop: S[2] }}>
            {isOwner
              ? `SN: ${item.serial_number}`
              : <span>SN: <span style={{ letterSpacing: '0.1em' }}>••••••••</span> <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>· visible to owner</span></span>
            }
          </div>
        </div>

        {/* Price + buy/owner controls */}
        <div style={{ padding: `${S[5]}px 0`, borderBottom: `1px solid var(--divider)` }}>

          {/* Wait for wallet before deciding owner vs buyer view */}
          {!walletReady ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
              <span style={{ ...t('body'), color: C.muted }}>Loading wallet…</span>
            </div>
          ) : isOwner ? (
            item.is_listed && item.price_usdc && !editingPrice ? (
              /* Listed — show controls */
              <div>
                <div style={price('lg')}>
                  ${item.price_usdc.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ ...sectionLabel(), marginTop: S[2], marginBottom: S[5] }}>Listed for sale</div>
                <div style={{ display: 'flex', gap: S[3] }}>
                  <button onClick={() => { setEditingPrice(true); setListPrice(String(item.price_usdc ?? '')); }}
                    style={{ ...btn('secondary', { full: true, pill: false }), flex: 1 }}>
                    Edit Price
                  </button>
                  <button onClick={handleUnlist} disabled={unlistStatus === 'unlisting'}
                    style={{ ...btn('danger', { full: true, pill: false }), flex: 1, opacity: unlistStatus === 'unlisting' ? 0.6 : 1 }}>
                    {unlistStatus === 'unlisting' ? 'Removing…' : 'Unlist'}
                  </button>
                </div>
              </div>
            ) : (
              /* Not listed or editing price — show list/update form */
              listStatus === 'done' ? (
                <div style={{ ...t('body'), color: C.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: S[2] }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {editingPrice ? 'Price updated!' : 'Listed successfully!'}
                </div>
              ) : (
                <form onSubmit={handleList}>
                  <div style={{ position: 'relative', marginBottom: S[3] }}>
                    <div style={{ position: 'absolute', left: S[4], top: '50%', transform: 'translateY(-50%)', ...t('heading'), color: 'var(--text-muted)' }}>$</div>
                    <input type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="0.00" required min="0.01" step="0.01"
                      style={{ ...input(), padding: '13px 60px 13px 30px', boxSizing: 'border-box' }} />
                    <div style={{ position: 'absolute', right: S[4], top: '50%', transform: 'translateY(-50%)', ...t('meta'), color: C.muted }}>USDC</div>
                  </div>
                  <button type="submit" disabled={listStatus === 'listing'}
                    style={{ ...btn('primary', { full: true }), cursor: listStatus === 'listing' ? 'not-allowed' : 'pointer', opacity: listStatus === 'listing' ? 0.6 : 1 }}>
                    {listStatus === 'listing' ? (
                      <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} /> Listing…</>
                    ) : editingPrice ? `Update Price${listPrice ? ` · $${parseFloat(listPrice).toFixed(2)}` : ''}` : `List Now${listPrice ? ` · $${parseFloat(listPrice).toFixed(2)}` : ''}`}
                  </button>
                  {editingPrice && (
                    <button type="button" onClick={() => setEditingPrice(false)}
                      style={{ ...btn('text', { full: true }), marginTop: S[2] }}>
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
                <div style={price('lg')}>
                  ${item.price_usdc.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ ...sectionLabel(), marginTop: S[2], marginBottom: S[5] }}>USDC</div>

                {walletAddress && buyStatus === 'done' ? (
                  <div style={{ ...badge('success'), display: 'flex', alignItems: 'center', gap: S[2], padding: S[4], borderRadius: 'var(--r)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ ...t('heading'), color: C.green }}>Purchase complete!</span>
                  </div>
                ) : walletAddress ? (
                  <button onClick={() => setShowCheckout(true)} style={btn('primary', { full: true })}>
                    Buy Now · ${item.price_usdc.toFixed(2)}
                  </button>
                ) : (
                  <Link href="/login" style={btn('primary', { full: true })}>
                    Sign In to Buy
                  </Link>
                )}
              </>
            ) : (
              <div style={{ ...t('body'), color: C.muted }}>Not listed for sale</div>
            )
          )}
        </div>

        {/* Seller */}
        <div style={{ padding: `${S[5]}px 0`, borderBottom: `1px solid var(--divider)` }}>
          <div style={{ ...sectionLabel(), marginBottom: S[3] }}>Seller</div>
          <div style={{ ...card({ pad: S[4] }) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
              <div style={{ ...avatar('md'), background: GH }}>
                {sellerInitial}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...t('heading'), color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: S[1] }}>
                  {sellerDisplay}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ ...t('meta'), color: C.muted, marginTop: S[1] }}>Verified seller</div>
              </div>
            </div>
            {!isOwner && !privateMode && (
              <Link href={`/dashboard?msg=${item.current_owner_wallet}`}
                style={{ ...btn('secondary', { full: true }), marginTop: S[4] }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Message Seller
              </Link>
            )}
          </div>
        </div>

        {/* Description */}
        {item.description && (
          <div style={{ padding: `${S[5]}px 0`, borderBottom: `1px solid var(--divider)` }}>
            <button onClick={() => setShowDesc(s => !s)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>Description</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ transform: showDesc ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showDesc && <div style={{ ...t('body'), color: 'var(--text)', lineHeight: 1.75, marginTop: S[3] }}>{item.description}</div>}
          </div>
        )}

        {/* Provenance */}
        <div style={{ padding: `${S[5]}px 0`, borderBottom: `1px solid var(--divider)` }}>
          <div style={{ ...sectionLabel(), marginBottom: S[3] }}>Provenance</div>
          <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <div>
              <div style={{ ...t('micro'), color: C.muted, marginBottom: S[1] }}>Mint address</div>
              <div style={{ ...t('meta'), color: 'var(--text-strong)', wordBreak: 'break-all' }}>{item.nft_mint_address || '—'}</div>
            </div>
            {item.nft_mint_address && (
              <a href={`https://explorer.solana.com/address/${item.nft_mint_address}`} target="_blank" rel="noopener noreferrer"
                style={{ ...t('meta'), display: 'inline-flex', alignItems: 'center', gap: S[1], color: 'var(--text-strong)', textDecoration: 'none' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                View on explorer
              </a>
            )}
          </div>
        </div>

        {/* Ownership history */}
        <div style={{ padding: `${S[5]}px 0` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[4] }}>
            <div style={{ ...sectionLabel() }}>Ownership history</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{history.length} event{history.length !== 1 ? 's' : ''}</div>
          </div>
          {(item as any).transfer_count > 0 && (
            <div style={{ ...t('meta'), color: C.muted, marginBottom: S[3], display: 'flex', alignItems: 'center', gap: S[1] }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Minted as: {item.condition}
            </div>
          )}
          {history.length === 0 ? (
            <div style={{ ...t('body'), color: 'var(--text-muted)' }}>No history yet</div>
          ) : (
            <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column' }}>
              {history.map((r, i) => {
                const isMint    = r.event_type === 'mint';
                const isLatest  = i === history.length - 1;
                const accentCol = 'var(--text-muted)';
                const fullDate  = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const fullTime  = new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const shortTx   = r.tx_hash ? `${r.tx_hash.slice(0,8)}…${r.tx_hash.slice(-8)}` : '';

                return (
                  <div key={r.id} style={{ display: 'flex', gap: S[3], paddingBottom: i < history.length - 1 ? S[5] : 0 }}>

                    {/* Timeline spine */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-bg)', border: `1px solid var(--glass-hairline)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                        {isMint
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accentCol} strokeWidth="2.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accentCol} strokeWidth="2.5" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                        }
                        {isLatest && (
                          <div style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--text-muted)', border: '2px solid var(--surface-bg)' }} />
                        )}
                      </div>
                      {i < history.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 20, background: 'var(--divider)', marginTop: S[1] }} />}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, paddingTop: S[1] }}>

                      {/* Row 1: event label + date */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: S[2], gap: S[2] }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                          <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>
                            {isMint
                              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ marginRight: 4, verticalAlign: 'middle' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Minted</>
                              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 4, verticalAlign: 'middle' }}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>Transferred</>
                            }
                          </span>
                          {r.price_usdc && (
                            <span style={{ ...t('meta'), color: 'var(--text)' }}>
                              ${r.price_usdc.toFixed(2)} USDC
                            </span>
                          )}
                          {isLatest && (
                            <span style={{ ...badge('default') }}>Current</span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ ...t('meta'), color: C.muted }}>{timeAgo(r.created_at)}</div>
                          <div style={{ ...t('micro'), fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--text-muted)', marginTop: 1 }}>{fullDate} {fullTime}</div>
                        </div>
                      </div>

                      {/* Row 2: wallet(s) */}
                      {r.from_wallet ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[2], flexWrap: 'wrap' }}>
                          <Link href={`/p/${r.from_wallet}`} style={{ display: 'flex', alignItems: 'center', gap: S[1], textDecoration: 'none' }}>
                            <div style={{ ...avatar('sm'), width: 20, height: 20, fontSize: 8, background: `linear-gradient(135deg,${C.blue},${C.mag})` }}>
                              {r.from_wallet[0]?.toUpperCase()}
                            </div>
                            <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{shortAddr(r.from_wallet)}</span>
                          </Link>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                          <Link href={`/p/${r.owner_wallet}`} style={{ display: 'flex', alignItems: 'center', gap: S[1], textDecoration: 'none' }}>
                            <div style={{ ...avatar('sm'), width: 20, height: 20, fontSize: 8, background: `linear-gradient(135deg,${C.teal},${C.blue})` }}>
                              {r.owner_wallet[0]?.toUpperCase()}
                            </div>
                            <span style={{ ...t('meta'), color: 'var(--text)' }}>{shortAddr(r.owner_wallet)}</span>
                          </Link>
                        </div>
                      ) : (
                        <div style={{ marginBottom: S[2] }}>
                          <Link href={`/p/${r.owner_wallet}`} style={{ display: 'inline-flex', alignItems: 'center', gap: S[1], textDecoration: 'none' }}>
                            <div style={{ ...avatar('sm'), width: 20, height: 20, fontSize: 8, background: `linear-gradient(135deg,${C.teal},${C.blue})` }}>
                              {r.owner_wallet[0]?.toUpperCase()}
                            </div>
                            <span style={{ ...t('meta'), color: 'var(--text)' }}>{shortAddr(r.owner_wallet)}</span>
                          </Link>
                        </div>
                      )}

                      {/* Row 3: TX hash */}
                      {r.tx_hash && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                          <a href={`https://explorer.solana.com/tx/${r.tx_hash}`} target="_blank" rel="noopener noreferrer"
                            style={{ ...t('meta'), color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: S[1] }}>
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
