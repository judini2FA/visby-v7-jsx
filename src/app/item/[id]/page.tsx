'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';
import CheckoutModal from '@/components/checkout-modal';
import { S, t, price, card, surface, btn, badge, avatar, sectionLabel, input } from '@/lib/ui';
import { explorerAddress } from '@/lib/explorer';
import { trpc } from '@/lib/trpc/client';
import { ReputationBadge } from '@/components/reviews';
import { LikeButton } from '@/components/like-button';
import { feeBreakdown } from '@/lib/fees';
import { AuthBadge } from '@/components/auth-badge';
import { BrandBadge } from '@/components/brand-badge';
import { AvatarCircle } from '@/components/owner-stack';
import { ReportButton } from '@/components/report-button';
import { isAdminWallet } from '@/lib/admin';
import { useCurrency } from '@/lib/currency';
import { HeaderMenu } from '@/components/layout/header-menu';

const C = {
  navy: 'transparent', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: 'var(--ok)', red: 'var(--danger)', border: 'var(--glass-border)',
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
  weight_oz?: number; ship_service_pref?: string;
  auth_status?: string;
  ownership_history?: OwnershipRecord[];
  profiles?: Record<string, { avatar_url: string | null; display_name: string | null }>;
}

export default function ItemPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, getAccessToken } = usePrivy();
  const { address: walletAddress, ready: walletReady } = useVisbWallet();
  const { format: fmtPrice, currency } = useCurrency();
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
  const [itemOrder, setItemOrder] = useState<{ status: string; shipped_at: string | null; delivered_at: string | null } | null | undefined>(undefined);
  const [shipEst, setShipEst] = useState<number | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const isAdmin = isAdminWallet(walletAddress);

  async function handleSetAuth(auth_status: 'authenticated' | 'flagged') {
    if (!item || !walletAddress || authBusy) return;
    setAuthBusy(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/items/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ wallet: walletAddress, item_id: item.id, auth_status }),
      });
      if (res.ok) {
        setItem(prev => prev ? { ...prev, auth_status } : prev);
      }
    } catch {}
    finally { setAuthBusy(false); }
  }

  const { data: sellerRep, isLoading: repLoading } = trpc.reviews.getReputation.useQuery(
    { wallet: item?.current_owner_wallet ?? '' },
    { enabled: !!item?.current_owner_wallet },
  );
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
    const k = 'viewed:' + id;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch {}
    fetch('/api/items/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: id, viewer_wallet: walletAddress ?? undefined }),
    }).catch(() => {});
  }, [id, walletAddress]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orders/item/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { order: { status: string; shipped_at: string | null; delivered_at: string | null } | null } | null) => {
        setItemOrder(d?.order ?? null);
      })
      .catch(() => setItemOrder(null));
  }, [id]);

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

  // Estimate shipping for the seller payout breakdown (only meaningful for a listed item with a weight).
  useEffect(() => {
    const w = item?.weight_oz;
    if (!item?.is_listed || !item?.price_usdc || !w) { setShipEst(null); return; }
    fetch('/api/shipping/estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_oz: Number(w), service: item.ship_service_pref || '2day' }),
    })
      .then(r => r.json())
      .then(d => { if (typeof d.amount === 'number') setShipEst(d.amount); })
      .catch(() => {});
  }, [item]);

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

  const profiles = item.profiles ?? {};
  const sellerProfile = profiles[item.current_owner_wallet];
  const sellerDisplay = sellerProfile?.display_name || shortAddr(item.current_owner_wallet);
  const sellerAvatar  = sellerProfile?.avatar_url ?? null;
  const sellerInitial = (item.current_owner_wallet[0] ?? '?').toUpperCase();
  const history = item.ownership_history ?? [];
  const ownerCount = new Set(history.map(h => h.owner_wallet)).size || 1;

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <Link href="/marketplace" style={{ display: 'flex', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div style={{ ...t('heading'), flex: 1, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <HeaderMenu />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[3], flexWrap: 'wrap' }}>
            <span style={{ ...badge('default') }}>{item.category}</span>
            <BrandBadge status={(item as any).serial_status} brand={(item as any).brand} />
            {isOwner && <span style={{ ...badge('default') }}>You own this</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <h1 style={{ ...t('title'), color: 'var(--text-strong)', margin: 0, flex: 1 }}>{item.name}</h1>
            <AuthBadge status={item.auth_status} />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><title>Name is locked at mint</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <LikeButton itemId={item.id} variant="inline" showCount />
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
                  {fmtPrice(item.price_usdc)}
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

                {/* Seller payout breakdown — Visby cut + shipping deducted from the sale price */}
                <div style={{ ...surface({ pad: S[4] }), marginTop: S[4], display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Your payout</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>List price</span>
                    <span style={{ ...t('meta'), color: 'var(--text)' }}>${item.price_usdc.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Visby fee (9%)</span>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>−${feeBreakdown(item.price_usdc, 0).platform_fee_usd.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Estimated shipping</span>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{shipEst != null ? `−$${shipEst.toFixed(2)}` : 'set at fulfillment'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: S[1], paddingTop: S[2], borderTop: '1px solid var(--divider)' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>You net</span>
                    <span style={{ ...t('heading'), color: C.green }}>{shipEst != null ? '' : '~'}${feeBreakdown(item.price_usdc, shipEst ?? 0).seller_net_usd.toFixed(2)}</span>
                  </div>
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
                  {fmtPrice(item.price_usdc)}
                </div>
                <div style={{ ...sectionLabel(), marginTop: S[2], marginBottom: S[3] }}>
                  {currency === 'USD' ? 'USDC' : `≈ $${item.price_usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
                </div>

                {/* Universal Visby free shipping — buyer pays only the listed price */}
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[5] }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  <span style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>All Visby Orders have universal free shipping</span>
                </div>

                {walletAddress && buyStatus === 'done' ? (
                  <div style={{ ...badge('success'), display: 'flex', alignItems: 'center', gap: S[2], padding: S[4], borderRadius: 'var(--r)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ ...t('heading'), color: C.green }}>Purchase complete!</span>
                  </div>
                ) : walletAddress ? (
                  <>
                    <button onClick={() => setShowCheckout(true)} style={btn('primary', { full: true })}>
                      Buy Now · ${item.price_usdc.toFixed(2)}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginTop: S[3] }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Seller is paid only after you confirm delivery.</span>
                    </div>
                  </>
                ) : (
                  <Link href="/login" style={btn('primary', { full: true })}>
                    Sign In to Buy
                  </Link>
                )}
              </>
            ) : itemOrder ? (
              <div>
                <span style={{ ...badge('default') }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Sold
                </span>
                <div style={{ ...t('meta'), color: C.muted, marginTop: S[2] }}>
                  {itemOrder.status === 'shipped'
                    ? 'In transit'
                    : itemOrder.status === 'delivered'
                    ? 'Delivered'
                    : 'Awaiting shipment'}
                </div>
              </div>
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
              <div style={{ ...avatar('md'), background: sellerAvatar ? 'var(--surface-bg)' : GH }}>
                {sellerAvatar ? <img src={sellerAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : sellerInitial}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>
                  {sellerDisplay}
                </div>
                <div style={{ marginTop: S[1] }}>
                  {repLoading
                    ? null
                    : sellerRep && sellerRep.count > 0
                      ? <ReputationBadge avg={sellerRep.avg} count={sellerRep.count} />
                      : <span style={{ ...t('meta'), color: C.muted }}>New seller</span>}
                </div>
              </div>
            </div>
            {!isOwner && !privateMode && (
              <Link href={`/dashboard?msg=${item.current_owner_wallet}`}
                style={{ ...btn('secondary', { full: true }), marginTop: S[4] }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Message Seller
              </Link>
            )}
            {!isOwner && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: S[2] }}>
                <ReportButton
                  targetType="listing"
                  targetId={item.id}
                  reporterWallet={walletAddress ?? undefined}
                  getAccessToken={getAccessToken}
                  compact
                />
              </div>
            )}
            {isAdmin && (
              <div style={{ marginTop: S[4], paddingTop: S[4], borderTop: '1px solid var(--divider)' }}>
                <div style={{ ...t('micro'), color: 'var(--text-muted)', marginBottom: S[2], letterSpacing: '0.05em', textTransform: 'uppercase' }}>Admin</div>
                <div style={{ display: 'flex', gap: S[2] }}>
                  <button
                    onClick={() => handleSetAuth('authenticated')}
                    disabled={authBusy || item.auth_status === 'authenticated'}
                    style={{ ...btn('secondary', { full: true, pill: false }), flex: 1, opacity: (authBusy || item.auth_status === 'authenticated') ? 0.5 : 1, fontSize: 12 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/><polyline points="9 12 11 14 15 10"/></svg>
                    Mark Authenticated
                  </button>
                  <button
                    onClick={() => handleSetAuth('flagged')}
                    disabled={authBusy || item.auth_status === 'flagged'}
                    style={{ ...btn('danger', { full: true, pill: false }), flex: 1, opacity: (authBusy || item.auth_status === 'flagged') ? 0.5 : 1, fontSize: 12 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Flag
                  </button>
                </div>
              </div>
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

        {/* ── Tally — the provenance NFT, rendered as a tangible glossy object ── */}
        <div id="history" style={{ padding: `${S[5]}px 0`, scrollMarginTop: 72 }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-xl)', background: 'var(--grad-tally)', color: '#15121C', boxShadow: '0 14px 34px rgba(30,30,45,.20), inset 0 1px 0 rgba(255,255,255,.75)' }}>
            {/* shine */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(125deg, rgba(255,255,255,0) 38%, rgba(255,255,255,.45) 50%, rgba(255,255,255,0) 62%), radial-gradient(120% 70% at 12% 0%, rgba(255,255,255,.45), rgba(255,255,255,0) 55%)' }} />

            <div style={{ position: 'relative', padding: S[5] }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[1] }}>
                <span style={{ ...t('title'), color: '#15121C', fontWeight: 800 }}>Tally</span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'rgba(21,18,28,.6)', border: '1px solid rgba(21,18,28,.22)', borderRadius: 999, padding: '2px 7px' }}>NFT</span>
              </div>
              <div style={{ ...t('meta'), color: 'rgba(21,18,28,.68)', marginBottom: S[5], lineHeight: 1.5 }}>
                An NFT-powered provenance used to track the history of a product.
              </div>

              {/* Provenance — mint address */}
              <div style={{ ...t('micro'), color: 'rgba(21,18,28,.5)', letterSpacing: '.06em', marginBottom: S[1] }}>MINT ADDRESS</div>
              <div style={{ ...t('meta'), color: '#15121C', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: S[2] }}>{item.nft_mint_address || '—'}</div>
              {item.nft_mint_address && (
                <a href={explorerAddress(item.nft_mint_address)} target="_blank" rel="noopener noreferrer"
                  style={{ ...t('meta'), display: 'inline-flex', alignItems: 'center', gap: S[1], color: '#15121C', fontWeight: 700, textDecoration: 'none' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  View on explorer
                </a>
              )}

              {/* TallyTracker — the ownership history (newest first), full wallets for transparency */}
              <div style={{ height: 1, background: 'rgba(21,18,28,.14)', margin: `${S[5]}px 0` }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[3] }}>
                <span style={{ ...t('heading'), color: '#15121C', fontWeight: 800 }}>TallyTracker</span>
                <span style={{ ...t('meta'), color: 'rgba(21,18,28,.6)' }}>{ownerCount} owner{ownerCount !== 1 ? 's' : ''}</span>
              </div>
              {history.length === 0 ? (
                <div style={{ ...t('body'), color: 'rgba(21,18,28,.6)' }}>No history yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {[...history].reverse().map((r, idx, arr) => {
                    const w    = r.owner_wallet;
                    const prof = profiles[w];
                    const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return (
                      <Link key={r.id} href={`/p/${w}`}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: S[3], padding: `${S[3]}px 0`,
                                 borderBottom: idx < arr.length - 1 ? '1px solid rgba(21,18,28,.12)' : 'none', textDecoration: 'none' }}>
                        <AvatarCircle wallet={w} avatarUrl={prof?.avatar_url} size={40} ring="rgba(255,255,255,.65)" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                            <span style={{ ...t('body'), color: '#15121C', fontWeight: 700 }}>{prof?.display_name || shortAddr(w)}</span>
                            {idx === 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#15121C', background: 'rgba(255,255,255,.6)', borderRadius: 999, padding: '2px 8px' }}>Current</span>}
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(21,18,28,.66)', wordBreak: 'break-all', marginTop: 2 }}>
                            {w}{r.price_usdc ? ` · $${r.price_usdc.toFixed(2)}` : ''}
                          </div>
                        </div>
                        <div style={{ ...t('meta'), color: 'rgba(21,18,28,.6)', textAlign: 'right', flexShrink: 0 }}>{date}</div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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
