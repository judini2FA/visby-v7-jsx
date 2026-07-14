'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { S, t, price, card, surface, btn, badge, sectionLabel, input } from '@/lib/ui';
import { solscanTx } from '@/lib/explorer';
import { RateOrder } from '@/components/rate-order';
import { DisputePanel } from '@/components/dispute-panel';
import { HeaderMenu } from '@/components/layout/header-menu';
import { TallyExplainerInline } from '@/components/tally-explainer';

const GREEN = 'var(--ok)';

interface OwnershipRecord {
  id: string; owner_wallet: string; from_wallet?: string;
  tx_hash: string; event_type: string; price_usdc?: number; created_at: string;
}
interface Item {
  id: string; name: string; serial_number: string; condition: string;
  category: string; description?: string; image_url?: string;
  nft_mint_address: string; current_owner_wallet: string;
  is_listed: boolean; price_usdc?: number; created_at: string;
  ownership_history?: OwnershipRecord[];
}
interface ShipAddress {
  line1: string; line2: string; city: string; state: string; postal: string; country: string;
}
interface Order {
  id: string; item_id: string; buyer_wallet: string; seller_wallet: string;
  price_usdc: number; pay_method: string;
  status: 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  ship_name: string | null; ship_address: ShipAddress | null;
  tracking_carrier: string | null; tracking_number: string | null;
  payout_released: boolean; nft_tx: string | null;
  disputed?: boolean; refunded_at?: string | null; refund_tx?: string | null;
  created_at: string; shipped_at: string | null; delivered_at: string | null;
  items: { id: string; name: string; category: string; condition: string; serial_number: string; image_url: string; nft_mint_address: string };
}

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CatIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const TruckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);
const CheckIcon = ({ size = 13, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const PackageIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const CreditCardIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);

const STEPS = [
  { key: 'paid',      label: 'Payment received', Icon: CreditCardIcon },
  { key: 'shipped',   label: 'Shipped',           Icon: TruckIcon },
  { key: 'delivered', label: 'Delivered',          Icon: PackageIcon },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

function stepIndex(status: Order['status']): number {
  if (status === 'paid')      return 0;
  if (status === 'shipped')   return 1;
  if (status === 'delivered') return 2;
  return -1;
}

export default function OrderPage() {
  const { itemId } = useParams() as { itemId: string };
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { address: walletAddress, ready: walletReady } = useVisbWallet();

  const [item, setItem]       = useState<Item | null>(null);
  const [itemLoading, setItemLoading] = useState(true);
  const [order, setOrder]     = useState<Order | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMissing, setOrderMissing] = useState(false);
  const [copied, setCopied]   = useState(false);

  // Address form state
  const [shipName, setShipName]   = useState('');
  const [addrLine1, setAddrLine1] = useState('');
  const [addrLine2, setAddrLine2] = useState('');
  const [addrCity, setAddrCity]   = useState('');
  const [addrState, setAddrState] = useState('');
  const [addrPostal, setAddrPostal] = useState('');
  const [addrCountry, setAddrCountry] = useState('US');
  const [addrSaving, setAddrSaving]   = useState(false);
  const [addrError, setAddrError]     = useState('');

  // Confirm receipt state
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => {
    if (!itemId) return;
    fetch(`/api/item/${itemId}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setItem(d); })
      .catch(() => {})
      .finally(() => setItemLoading(false));
  }, [itemId]);

  const fetchOrder = useCallback(async () => {
    if (!walletAddress || !itemId) return;
    setOrderLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/orders?wallet=${walletAddress}&role=buyer`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setOrderMissing(true); return; }
      const data = await res.json();
      const found: Order | undefined = (data.orders ?? []).find((o: Order) => o.item_id === itemId);
      if (found) {
        setOrder(found);
        setOrderMissing(false);
      } else {
        setOrderMissing(true);
      }
    } catch {
      setOrderMissing(true);
    } finally {
      setOrderLoading(false);
    }
  }, [walletAddress, itemId, getAccessToken]);

  useEffect(() => {
    if (walletReady && walletAddress) fetchOrder();
  }, [walletReady, walletAddress, fetchOrder]);

  const transfer = item?.ownership_history
    ?.filter(h => h.event_type === 'transfer')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  const txHash    = transfer?.tx_hash ?? '';
  const pricePaid = transfer?.price_usdc;
  const isSolTx   = txHash.length > 40 && !txHash.startsWith('pi_') && !txHash.startsWith('stripe_');
  const solscanUrl = isSolTx ? solscanTx(txHash) : null;

  function copyTx() {
    navigator.clipboard.writeText(txHash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function submitAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !walletAddress) return;
    setAddrSaving(true);
    setAddrError('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/orders/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          order_id: order.id,
          buyer_wallet: walletAddress,
          ship_name: shipName,
          ship_address: { line1: addrLine1, line2: addrLine2, city: addrCity, state: addrState, postal: addrPostal, country: addrCountry },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to save address');
      await fetchOrder();
    } catch (err: unknown) {
      setAddrError(err instanceof Error ? err.message : 'Failed to save address');
    } finally {
      setAddrSaving(false);
    }
  }

  async function confirmReceipt() {
    if (!order || !walletAddress) return;
    setConfirmBusy(true);
    setConfirmError('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/orders/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id, buyer_wallet: walletAddress }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to confirm receipt');
      await fetchOrder();
    } catch (err: unknown) {
      setConfirmError(err instanceof Error ? err.message : 'Failed to confirm receipt');
    } finally {
      setConfirmBusy(false);
    }
  }

  if (itemLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--glass-border)', borderTopColor: 'var(--text-muted)', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const currentStep = order ? stepIndex(order.status) : -1;
  const stepTimestamps: Record<StepKey, string | null> = {
    paid:      order?.created_at ?? null,
    shipped:   order?.shipped_at ?? null,
    delivered: order?.delivered_at ?? null,
  };

  const canConfirm = order && (order.status === 'paid' || order.status === 'shipped');
  const showTracking = order && (order.status === 'shipped' || order.status === 'delivered') && order.tracking_number;

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${S[6]}px ${S[4]}px` }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pop { 0% { transform: scale(.7); opacity: 0; } 80% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }`}</style>

      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50 }}>
        <HeaderMenu />
      </div>

      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: S[5] }}>

        {/* Success header */}
        <div style={{ ...card(), padding: S[6], textAlign: 'center', animation: 'pop .4s ease-out' }}>
          <div style={{ ...surface({ radius: '50%' }), width: 72, height: 72, background: order?.status === 'refunded' ? 'var(--surface-bg)' : 'var(--ok-soft)', border: order?.status === 'refunded' ? '1px solid var(--glass-border)' : '1px solid var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `0 auto ${S[5]}px` }}>
            {order?.status === 'refunded' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </div>
          <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[2] }}>
            {order?.status === 'refunded' ? 'Order refunded'
              : order?.status === 'delivered' ? 'Order delivered!'
              : 'Your order is on its way!'}
          </div>
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
            {order?.status === 'refunded'
              ? 'Your payment has been returned. This sale was reversed.'
              : 'You now own the verified chain of custody for this item.'}
          </div>
          {pricePaid != null && (
            <div style={{ marginTop: S[5], display: 'inline-flex', alignItems: 'baseline', gap: S[2], ...surface({ pad: `${S[3]}px ${S[5]}px` }) }}>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Paid</span>
              <span style={price('sm')}>${pricePaid.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Item card */}
        {item && (
          <div style={{ ...card(), overflow: 'hidden' }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 110, flexShrink: 0, background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <CatIcon />}
              </div>
              <div style={{ flex: 1, padding: S[4], display: 'flex', flexDirection: 'column', gap: S[2] }}>
                <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>{item.name}</div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{item.category} · {item.condition}</div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>S/N {item.serial_number}</div>
              </div>
            </div>
          </div>
        )}

        {/* Order lifecycle */}
        {orderLoading && !order ? (
          <div style={{ ...card(), padding: S[5], display: 'flex', alignItems: 'center', gap: S[3] }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--glass-border)', borderTopColor: 'var(--text-muted)', animation: 'spin .8s linear infinite', flexShrink: 0 }} />
            <span style={{ ...t('body'), color: 'var(--text-muted)' }}>Loading order…</span>
          </div>
        ) : orderMissing ? (
          <div style={{ ...card(), padding: S[5] }}>
            <div style={{ ...t('body'), color: 'var(--text-muted)', textAlign: 'center' }}>
              Order details unavailable for this item.
            </div>
          </div>
        ) : order ? (
          <>
            {/* Status timeline */}
            <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ ...sectionLabel(), marginBottom: S[4] }}>Order status</div>
              {STEPS.map((step, i) => {
                const isDone    = i <= currentStep;
                const isCurrent = i === currentStep;
                const isLast    = i === STEPS.length - 1;
                const ts        = stepTimestamps[step.key];

                return (
                  <div key={step.key} style={{ display: 'flex', gap: S[3], paddingBottom: isLast ? 0 : S[4] }}>
                    {/* Spine */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: isDone ? 'var(--ok-soft)' : 'var(--surface-bg)',
                        border: isDone ? '1px solid var(--ok-soft)' : '1px solid var(--glass-hairline)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        position: 'relative',
                      }}>
                        <span style={{ color: isDone ? GREEN : 'var(--text-muted)' }}>
                          <step.Icon />
                        </span>
                        {/* Current step pulse dot */}
                        {isCurrent && (
                          <div style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: GREEN, border: '2px solid var(--surface-bg)' }} />
                        )}
                      </div>
                      {!isLast && (
                        <div style={{ width: 2, flex: 1, minHeight: 20, background: isDone ? 'var(--ok-soft)' : 'var(--divider)', marginTop: S[1] }} />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, paddingTop: S[1] }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2], flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                          <span style={{ ...t('heading'), color: isDone ? 'var(--text-strong)' : 'var(--text-muted)' }}>
                            {step.label}
                          </span>
                          {isDone && (
                            <span style={badge('success')}>
                              <CheckIcon size={9} color={GREEN} />
                              Done
                            </span>
                          )}
                          {!isDone && (
                            <span style={badge('default')}>Pending</span>
                          )}
                        </div>
                        {ts && (
                          <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{fmtDate(ts)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Shipping address */}
            <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: S[4] }}>
              <div style={sectionLabel()}>Shipping address</div>
              {order.ship_address ? (
                <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
                  {order.ship_name && (
                    <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>{order.ship_name}</div>
                  )}
                  <div style={{ ...t('body'), color: 'var(--text)' }}>{order.ship_address.line1}</div>
                  {order.ship_address.line2 && (
                    <div style={{ ...t('body'), color: 'var(--text)' }}>{order.ship_address.line2}</div>
                  )}
                  <div style={{ ...t('body'), color: 'var(--text)' }}>
                    {order.ship_address.city}, {order.ship_address.state} {order.ship_address.postal}
                  </div>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{order.ship_address.country}</div>
                </div>
              ) : (
                <form onSubmit={submitAddress} style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[1] }}>
                    Enter your shipping address so the seller can ship your item.
                  </div>
                  <input
                    placeholder="Full name"
                    value={shipName}
                    onChange={e => setShipName(e.target.value)}
                    required
                    style={{ ...input(), boxSizing: 'border-box' }}
                  />
                  <input
                    placeholder="Address line 1"
                    value={addrLine1}
                    onChange={e => setAddrLine1(e.target.value)}
                    required
                    style={{ ...input(), boxSizing: 'border-box' }}
                  />
                  <input
                    placeholder="Address line 2 (optional)"
                    value={addrLine2}
                    onChange={e => setAddrLine2(e.target.value)}
                    style={{ ...input(), boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: S[3] }}>
                    <input
                      placeholder="City"
                      value={addrCity}
                      onChange={e => setAddrCity(e.target.value)}
                      required
                      style={{ ...input(), boxSizing: 'border-box', flex: 2 }}
                    />
                    <input
                      placeholder="State"
                      value={addrState}
                      onChange={e => setAddrState(e.target.value)}
                      required
                      style={{ ...input(), boxSizing: 'border-box', flex: 1 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: S[3] }}>
                    <input
                      placeholder="Postal code"
                      value={addrPostal}
                      onChange={e => setAddrPostal(e.target.value)}
                      required
                      style={{ ...input(), boxSizing: 'border-box', flex: 1 }}
                    />
                    <input
                      placeholder="Country"
                      value={addrCountry}
                      onChange={e => setAddrCountry(e.target.value)}
                      required
                      style={{ ...input(), boxSizing: 'border-box', flex: 1 }}
                    />
                  </div>
                  {addrError && (
                    <div style={{ ...t('meta'), color: 'var(--danger)' }}>{addrError}</div>
                  )}
                  <button type="submit" disabled={addrSaving} style={{ ...btn('primary', { full: true }), opacity: addrSaving ? 0.6 : 1, cursor: addrSaving ? 'not-allowed' : 'pointer' }}>
                    {addrSaving ? (
                      <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} /> Saving…</>
                    ) : 'Save address'}
                  </button>
                </form>
              )}
            </div>

            {/* Tracking */}
            {showTracking && (
              <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={sectionLabel()}>Tracking</div>
                <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  {order.tracking_carrier && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Carrier</span>
                      <span style={{ ...t('body'), color: 'var(--text-strong)' }}>{order.tracking_carrier}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Tracking number</span>
                    <span style={{ ...t('body'), color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{order.tracking_number}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Report a problem */}
            {order && walletAddress && (
              <DisputePanel
                orderId={order.id}
                buyerWallet={walletAddress}
                status={order.status}
                payoutReleased={order.payout_released}
                getAccessToken={getAccessToken}
                onChange={fetchOrder}
              />
            )}

            {/* Confirm delivery / celebration */}
            {order.status === 'delivered' ? (
              <>
                <div style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: S[2], animation: 'pop .4s ease-out' }}>
                  <div style={{ ...surface({ radius: '50%' }), width: 48, height: 48, background: 'var(--ok-soft)', border: '1px solid var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckIcon size={22} color={GREEN} />
                  </div>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Delivered</div>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                    Ownership provenance is finalized on-chain.
                    {order.payout_released ? ' The seller’s payout has been released.' : ''}
                  </div>
                </div>
                {walletAddress && <RateOrder orderId={order.id} />}
              </>
            ) : canConfirm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                {order.status === 'shipped' && (
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center' }}>
                    Received your item? Confirm delivery to complete the order and release the seller's payout.
                  </div>
                )}
                <button
                  onClick={confirmReceipt}
                  disabled={confirmBusy}
                  style={{ ...btn('primary', { full: true }), opacity: confirmBusy ? 0.6 : 1, cursor: confirmBusy ? 'not-allowed' : 'pointer' }}
                >
                  {confirmBusy ? (
                    <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} /> Confirming…</>
                  ) : 'Confirm delivery'}
                </button>
                {confirmError && (
                  <div style={{ ...t('meta'), color: 'var(--danger)', textAlign: 'center' }}>{confirmError}</div>
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {/* Provenance / receipt */}
        <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <div style={sectionLabel()}>Provenance</div>
          <TallyExplainerInline />

          {txHash && (
            <div style={{ ...surface({ pad: `${S[3]}px ${S[4]}px` }) }}>
              <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[2] }}>
                Transaction
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                <div style={{ flex: 1, ...t('meta'), color: 'var(--text)', wordBreak: 'break-all' }}>
                  {txHash}
                </div>
                <button onClick={copyTx}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: S[1], color: copied ? GREEN : 'var(--text-muted)', flexShrink: 0 }}>
                  {copied
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  }
                </button>
                {solscanUrl && (
                  <a href={solscanUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', padding: S[1], color: 'var(--text-muted)', flexShrink: 0, textDecoration: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {walletAddress && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Owner</span>
              <Link href="/profile" style={{ ...t('meta'), color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                {shortAddr(walletAddress)}
              </Link>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: S[3] }}>
          <Link href="/dashboard" style={{ ...btn('secondary', { full: true }) }}>
            My Collection
          </Link>
          <Link href="/" style={{ ...btn('primary', { full: true }) }}>
            Keep Shopping
          </Link>
        </div>

      </div>
    </div>
  );
}
