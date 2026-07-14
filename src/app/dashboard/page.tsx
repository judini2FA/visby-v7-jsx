'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card, surface, sheet, btn, badge, avatar, sectionLabel, tabSlider, input, T } from '@/lib/ui';
import { createPortal } from 'react-dom';
import { HeaderMenu } from '@/components/layout/header-menu';
import { EmptyState } from '@/components/empty-state';
import PayRequest from '@/components/pay-request';
import { PresetComposer, StructuredBubble, type MessagePreset } from '@/components/preset-composer';
import { feeBreakdown } from '@/lib/fees';
import { ShipLabelFlow } from '@/components/ship-label-flow';

const C = {
  navy: 'transparent', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: 'var(--ok)', red: 'var(--danger)',
};

type Tab = 'notifications' | 'sales' | 'messages' | 'purchases';

// ─────────────────────────────────────────────────────────────
// Shared order types
// ─────────────────────────────────────────────────────────────
type OrderStatus = 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

interface OrderItem {
  id: string;
  name: string;
  category: string;
  condition: string;
  serial_number: string;
  image_url: string | null;
  nft_mint_address: string | null;
}

interface Order {
  id: string;
  item_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  price_usdc: number;
  pay_method: string;
  status: OrderStatus;
  ship_name: string | null;
  ship_address: { line1: string; line2?: string; city: string; state: string; postal: string; country: string } | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  payout_released: boolean;
  disputed?: boolean;
  nft_tx: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  shipping_cost: number | null;
  shipping_service: string | null;
  label_url: string | null;
  platform_fee_usd: number | null;
  sale_channel: string | null;
  seller_net_usd: number | null;
  items: OrderItem;
}

function DisputeBadge({ order }: { order: Pick<Order, 'status' | 'disputed'> }) {
  if (order.status === 'refunded') return <span style={{ ...badge('default') }}>Refunded</span>;
  if (!order.disputed) return null;
  return (
    <span style={{ ...badge('danger'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
      Disputed
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// PURCHASES tab
// ─────────────────────────────────────────────────────────────
function PurchasesTab({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/orders?wallet=${encodeURIComponent(wallet)}&role=buyer`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) setOrders(json.orders ?? []);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, getAccessToken]);

  function statusBadge(status: OrderStatus) {
    if (status === 'refunded') return null;
    if (status === 'delivered') return <span style={{ ...badge('success') }}>Delivered</span>;
    if (status === 'shipped') return (
      <span style={{ ...badge('default'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
        In Transit
      </span>
    );
    return <span style={{ ...badge('default') }}>Paid</span>;
  }

  if (loading) return (
    <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {[1, 2, 3].map(i => <div key={i} style={{ ...card(), height: 72, animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (orders.length === 0) return (
    <div style={{ textAlign: 'center', padding: `${S[7]}px 0` }}>
      <div style={{ ...t('heading'), color: 'var(--text)', marginBottom: S[2] }}>No purchases yet</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Items you buy will appear here</div>
    </div>
  );

  return (
    <div style={{ paddingTop: S[4] }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {orders.map((order) => {
          const item = order.items;
          return (
            <Link key={order.id} href={`/order/${order.item_id}`} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ ...surface(), width: 52, height: 52, overflow: 'hidden', flexShrink: 0 }}>
                  {item?.image_url
                    ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                      </div>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item?.name ?? '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginTop: S[1], flexWrap: 'wrap' }}>
                    {statusBadge(order.status)}
                    <DisputeBadge order={order} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ ...t('heading'), color: C.green }}>
                    {order.price_usdc != null ? `$${Number(order.price_usdc).toFixed(2)}` : '—'}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS tab
// ─────────────────────────────────────────────────────────────
interface NotificationRow {
  id: string;
  recipient_wallet: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

function shortWallet(w: string): string {
  if (!w || w.length < 12) return w ?? '';
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

// Links a user's name/wallet to their profile — their own profile (/profile) if it's the viewer,
// otherwise the public view (/p/[wallet]). Safe to nest inside a clickable ancestor row (Link/button):
// it stops propagation and navigates itself, mirroring OwnerStack's pattern in owner-stack.tsx.
function UserLink({ wallet, viewerWallet, children, style }: { wallet: string; viewerWallet: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const router = useRouter();
  const href = wallet && viewerWallet && wallet === viewerWallet ? '/profile' : `/p/${wallet}`;
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(href); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); router.push(href); } }}
      style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, ...style }}
    >
      {children}
    </span>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

function NotifIcon({ type }: { type: string }) {
  const s = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'order_sold':
      return <svg {...s}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
    case 'order_shipped':
      return <svg {...s}><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
    case 'order_delivered':
      return <svg {...s}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
    case 'message':
      return <svg {...s}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'offer':
      return <svg {...s}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    case 'review':
      return <svg {...s}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'dispute_opened':
    case 'dispute_resolved':
    case 'item_flagged':
      return <svg {...s}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
    case 'item_authenticated':
      return <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>;
    default:
      return <svg {...s}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
  }
}

interface IncomingOffer {
  id: string;
  item_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  amount_usd: number;
  status: string;
  created_at: string;
  item: { name: string; image_url: string | null; price_usdc: number | null; is_listed: boolean } | null;
}

function NotificationsTab({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const utils = trpc.useUtils();
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<IncomingOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [offerErr, setOfferErr] = useState<Record<string, string>>({});

  // Pinned "sold, needs a label" / "you got paid" cards (N1) — computed from the seller's own
  // orders, no migration needed. Sharing the fetch here (rather than lifting SalesTab's) keeps the
  // Notifications tab self-contained and matches the file-ownership boundary for this pass.
  const [sellerOrders, setSellerOrders] = useState<Order[]>([]);
  const [sellerOrdersLoading, setSellerOrdersLoading] = useState(true);
  const [shipOrder, setShipOrder] = useState<Order | null>(null);
  const [dismissedPaid, setDismissedPaid] = useState<Set<string>>(new Set());
  const [showUnshippedPopup, setShowUnshippedPopup] = useState(false);

  const { data: likeNotifs = [], isLoading: likesLoading } = trpc.likes.getForOwner.useQuery(
    { owner_wallet: wallet },
    { enabled: !!wallet }
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem('visby_dismissed_payout_cards');
      if (raw) setDismissedPaid(new Set(JSON.parse(raw)));
    } catch { /* cosmetic — ignore */ }
  }, []);

  function dismissPaidCard(orderId: string) {
    setDismissedPaid(prev => {
      const next = new Set(prev);
      next.add(orderId);
      try { localStorage.setItem('visby_dismissed_payout_cards', JSON.stringify([...next])); } catch { /* cosmetic */ }
      return next;
    });
  }

  useEffect(() => {
    if (!wallet) { setSellerOrdersLoading(false); return; }
    let cancelled = false;
    (async () => {
      setSellerOrdersLoading(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/orders?wallet=${encodeURIComponent(wallet)}&role=seller`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) setSellerOrders(json.orders ?? []);
      } catch {
        if (!cancelled) setSellerOrders([]);
      } finally {
        if (!cancelled) setSellerOrdersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, getAccessToken]);

  const unshippedPaid = sellerOrders.filter(o => o.status === 'paid');
  const gotPaidCards = sellerOrders.filter(o => o.status === 'delivered' && o.payout_released && !dismissedPaid.has(o.id));

  // One-time-per-session popup summarizing unshipped sold orders, the moment they're known.
  useEffect(() => {
    if (sellerOrdersLoading || !unshippedPaid.length) return;
    try {
      if (sessionStorage.getItem('visby_unshipped_popup_shown')) return;
      sessionStorage.setItem('visby_unshipped_popup_shown', '1');
      setShowUnshippedPopup(true);
    } catch { /* cosmetic — sessionStorage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerOrdersLoading, unshippedPaid.length]);

  function netForOrder(order: Order): number {
    const shipCost = order.shipping_cost != null ? Number(order.shipping_cost) : 0;
    const price = Number(order.price_usdc);
    const feeUsd = order.platform_fee_usd != null ? Number(order.platform_fee_usd) : feeBreakdown(price, 0, order.sale_channel).platform_fee_usd;
    return order.seller_net_usd != null ? Number(order.seller_net_usd) : Math.max(0, price - feeUsd - shipCost);
  }

  async function loadOffers() {
    if (!wallet) return;
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/offers/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const incoming: IncomingOffer[] = Array.isArray(json.incoming) ? json.incoming : [];
      setOffers(incoming.filter(o => o.status === 'pending'));
    } catch {
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }

  useEffect(() => {
    if (!wallet) { setOffersLoading(false); return; }
    setOffersLoading(true);
    loadOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  async function respondOffer(offerId: string, action: 'accept' | 'decline') {
    setRespondingId(offerId);
    setOfferErr(prev => ({ ...prev, [offerId]: '' }));
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ offer_id: offerId, action }),
      });
      const json = await res.json();
      if (!json.ok) {
        setOfferErr(prev => ({ ...prev, [offerId]: json.error ?? 'Something went wrong' }));
        return;
      }
      setOffers(prev => prev.filter(o => o.id !== offerId));
    } catch {
      setOfferErr(prev => ({ ...prev, [offerId]: 'Network error' }));
    } finally {
      setRespondingId(null);
    }
  }

  async function loadNotifs() {
    if (!wallet) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/notifications?wallet=${encodeURIComponent(wallet)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setNotifs(Array.isArray(json.notifications) ? json.notifications : []);
    } catch {
      setNotifs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/notifications?wallet=${encodeURIComponent(wallet)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) setNotifs(Array.isArray(json.notifications) ? json.notifications : []);
      } catch {
        if (!cancelled) setNotifs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, getAccessToken]);

  async function markRead(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      const token = await getAccessToken();
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, id }),
      });
      utils.notifications.unreadCount.invalidate();
    } catch {
      // non-fatal — read state is cosmetic
    }
  }

  async function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    try {
      const token = await getAccessToken();
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet }),
      });
      utils.notifications.unreadCount.invalidate();
      await loadNotifs();
    } catch {
      // non-fatal
    }
  }

  if (loading || likesLoading || offersLoading || sellerOrdersLoading) return (
    <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {[1,2,3].map(i => <div key={i} style={{ ...card(), height: 64, animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  const unreadCount = notifs.filter(n => !n.read).length;
  const isEmpty = notifs.length === 0 && likeNotifs.length === 0 && offers.length === 0
    && unshippedPaid.length === 0 && gotPaidCards.length === 0;

  if (isEmpty) return (
    <div style={{ paddingTop: S[4] }}>
      <EmptyState
        icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
        title="No notifications yet"
        message="When someone likes, buys, or messages you about your items, you'll see it here."
        action={{ label: 'Browse the market', href: '/' }}
      />
    </div>
  );

  return (
    <div style={{ paddingTop: S[4] }}>
      {(unshippedPaid.length > 0 || gotPaidCards.length > 0) && (
        <div style={{ marginBottom: S[6], display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {unshippedPaid.map(order => (
            <div key={order.id} style={{ ...card({ pad: S[4] }), borderColor: '#2A8AED', borderWidth: 1.5, borderStyle: 'solid' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                <div style={{ ...surface(), width: 44, height: 44, overflow: 'hidden', flexShrink: 0 }}>
                  {order.items?.image_url
                    ? <img src={order.items.image_url} alt={order.items.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', background: 'var(--surface-bg)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    You sold {order.items?.name ?? 'an item'} — create a shipping label
                  </div>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>
                    ${netForOrder(order).toFixed(2)} on the way — payout releases on delivery
                  </div>
                </div>
              </div>
              <button onClick={() => setShipOrder(order)} style={{ ...btn('primary', { full: true }), marginTop: S[3] }}>
                Create shipping label
              </button>
            </div>
          ))}
          {gotPaidCards.map(order => (
            <div key={order.id} style={{ ...card({ pad: S[4] }), position: 'relative' }}>
              <button
                onClick={() => dismissPaidCard(order.id)}
                aria-label="Dismiss"
                style={{ position: 'absolute', top: S[3], right: S[3], background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[3], paddingRight: S[5] }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    You got paid ${netForOrder(order).toFixed(2)} for {order.items?.name ?? 'your item'}
                  </div>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>Delivered · payout released</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {offers.length > 0 && (
        <div style={{ marginBottom: S[6] }}>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Offers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {offers.map(o => (
              <div key={o.id} style={{ ...surface({ pad: '12px 16px' }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                  <div style={{ ...surface({ radius: '50%' }), width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                    <NotifIcon type="offer" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Offer on {o.item?.name ?? 'your item'}
                    </div>
                    <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>
                      <UserLink wallet={o.buyer_wallet} viewerWallet={wallet} style={{ color: 'inherit' }}>
                        {shortWallet(o.buyer_wallet)}
                      </UserLink>
                      {' offered '}
                      <span style={{ color: 'var(--text-strong)', fontWeight: 700 }}>${Number(o.amount_usd).toFixed(2)}</span>
                      {o.item?.price_usdc != null ? ` (list $${Number(o.item.price_usdc).toFixed(2)})` : ''}
                    </div>
                  </div>
                </div>
                {offerErr[o.id] && (
                  <div style={{ ...t('meta'), color: 'var(--danger)' }}>{offerErr[o.id]}</div>
                )}
                <div style={{ display: 'flex', gap: S[2] }}>
                  <button
                    onClick={() => respondOffer(o.id, 'decline')}
                    disabled={respondingId === o.id}
                    style={{ ...btn('secondary'), flex: 1, fontSize: 13, padding: '8px 12px', opacity: respondingId === o.id ? 0.6 : 1 }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => respondOffer(o.id, 'accept')}
                    disabled={respondingId === o.id}
                    style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '8px 12px', opacity: respondingId === o.id ? 0.6 : 1 }}
                  >
                    {respondingId === o.id ? 'Working…' : 'Accept'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {notifs.length > 0 && (
        <>
          {unreadCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: S[1] }}>
              <button onClick={markAllRead} style={{ ...btn('text'), padding: '4px 8px' }}>Mark all read</button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {notifs.map(n => {
              const Row = (
                <div style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
                  <div style={{ ...surface({ radius: '50%' }), width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                    <NotifIcon type={n.type} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                    {n.body && (
                      <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexShrink: 0 }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{relativeTime(n.created_at)}</span>
                    {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.gradBrand, flexShrink: 0 }} />}
                  </div>
                </div>
              );
              // A payment-request notification used to fall through to its generic `link`
              // (/wallet?tab=pay — a context-free "blank pay page"). Route it to the specific
              // request instead, now that /request/[id] exists.
              const requestId = (n.type === 'payment_request' || n.type === 'payment_request_paid')
                ? (n.data?.request_id as string | undefined)
                : undefined;
              const effectiveLink = requestId ? `/request/${requestId}` : n.link;
              return effectiveLink ? (
                <Link key={n.id} href={effectiveLink} onClick={() => { if (!n.read) markRead(n.id); }} style={{ textDecoration: 'none' }}>
                  {Row}
                </Link>
              ) : (
                <div key={n.id} onClick={() => { if (!n.read) markRead(n.id); }} style={{ cursor: n.read ? 'default' : 'pointer' }}>
                  {Row}
                </div>
              );
            })}
          </div>
        </>
      )}

      {likeNotifs.length > 0 && (
        <div style={{ marginTop: notifs.length > 0 ? S[6] : 0 }}>
          <div style={{ ...sectionLabel(), padding: '0 16px', marginBottom: S[2] }}>Likes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {likeNotifs.map((n: any) => (
              <div key={n.item_id} style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
                <div style={{ ...surface({ radius: '50%' }), width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>{n.count} like{n.count !== 1 ? 's' : ''}</div>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.item_name}</div>
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(n.latest_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showUnshippedPopup && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setShowUnshippedPopup(false)} style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'var(--modal-scrim)' }} />
          <div style={{ ...sheet({ radius: 'var(--r-xl)' }), position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'calc(100% - 48px)', maxWidth: 420, zIndex: 251, padding: S[5], display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>
              {unshippedPaid.length} order{unshippedPaid.length !== 1 ? 's' : ''} waiting on a shipping label
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2], maxHeight: '40vh', overflowY: 'auto' }}>
              {unshippedPaid.map(order => (
                <div key={order.id} style={{ ...surface({ pad: '10px 12px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
                  <div style={{ flex: 1, minWidth: 0, ...t('body'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.items?.name ?? 'Item'}
                  </div>
                  <button
                    onClick={() => { setShowUnshippedPopup(false); setShipOrder(order); }}
                    style={{ ...btn('secondary'), fontSize: 13, padding: '7px 12px', flexShrink: 0 }}
                  >
                    Create label
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowUnshippedPopup(false)} style={{ ...btn('primary', { full: true }) }}>Got it</button>
          </div>
        </>,
        document.body,
      )}

      {shipOrder && (
        <ShipLabelFlow
          order={shipOrder}
          onClose={() => setShipOrder(null)}
          onShipped={(updated) => {
            setSellerOrders(prev => prev.map(o => o.id === shipOrder.id ? { ...o, ...updated } as Order : o));
            setShipOrder(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SALES HISTORY tab
// ─────────────────────────────────────────────────────────────

interface FulfillRowProps {
  order: Order;
  onCreateLabel: (order: Order) => void;
}

// Compact "to fulfill" row (SH2) — the rate-shop/buy/manual-tracking steps now live in the shared
// ShipLabelFlow modal (src/components/ship-label-flow.tsx) so the exact same walkthrough is reachable
// from here AND from the Notifications pinned card, instead of two divergent inline implementations.
function FulfillRow({ order, onCreateLabel }: FulfillRowProps) {
  const item = order.items;
  const hasAddress = !!order.ship_address;

  return (
    <div style={{ ...card({ pad: S[4] }), marginBottom: S[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[3] }}>
        <div style={{ ...surface(), width: 48, height: 48, overflow: 'hidden', flexShrink: 0 }}>
          {item?.image_url
            ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              </div>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item?.name ?? '—'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginTop: S[1] }}>
            <span style={{ ...badge('default') }}>Awaiting shipment</span>
            <span style={{ ...t('meta'), color: C.green }}>${Number(order.price_usdc).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {!hasAddress ? (
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Waiting for the buyer to enter their shipping address.</div>
      ) : (
        <button onClick={() => onCreateLabel(order)} style={{ ...btn('primary', { full: true, pill: false }) }}>
          Create label
        </button>
      )}
    </div>
  );
}

function SalesTab({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const { data: sales = [], isLoading } = trpc.listings.getSoldByWallet.useQuery(
    { wallet },
    { enabled: !!wallet }
  );

  const [sellerOrders, setSellerOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [shipOrder, setShipOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      setOrdersLoading(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/orders?wallet=${encodeURIComponent(wallet)}&role=seller`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) setSellerOrders(json.orders ?? []);
      } catch {
        if (!cancelled) setSellerOrders([]);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, getAccessToken]);

  const toFulfill = sellerOrders.filter(o => o.status === 'paid');
  const alreadyHandled = sellerOrders.filter(o => o.status === 'shipped' || o.status === 'delivered');

  const totalRevenue = sales.reduce((a: number, s: any) => a + (Number(s.price_usdc) || 0), 0);
  const avgPrice     = sales.length ? totalRevenue / sales.length : 0;

  if (isLoading || ordersLoading) return (
    <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {[1,2,3].map(i => <div key={i} style={{ ...card(), height: 72, animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  return (
    <div style={{ paddingTop: S[4] }}>

      {/* ── To fulfill ── */}
      {(toFulfill.length > 0 || alreadyHandled.length > 0) && (
        <div style={{ marginBottom: S[6] }}>
          <div style={{ ...sectionLabel(), marginBottom: S[3] }}>
            To fulfill · {toFulfill.length}
          </div>
          {toFulfill.length === 0 && (
            <div style={{ ...t('meta'), color: 'var(--text-muted)', paddingBottom: S[2] }}>All orders fulfilled</div>
          )}
          {toFulfill.map(order => (
            <FulfillRow key={order.id} order={order} onCreateLabel={setShipOrder} />
          ))}
          {alreadyHandled.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {alreadyHandled.map(order => {
                const shipCost = order.shipping_cost != null ? Number(order.shipping_cost) : 0;
                const price = Number(order.price_usdc);
                const feeUsd = order.platform_fee_usd != null
                  ? Number(order.platform_fee_usd)
                  : feeBreakdown(price, 0, order.sale_channel).platform_fee_usd;
                const net = order.seller_net_usd != null
                  ? Number(order.seller_net_usd)
                  : Math.max(0, price - feeUsd - shipCost);
                return (
                  <div key={order.id} style={{ ...card({ pad: S[3] }), marginBottom: S[2] }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                      <div style={{ ...surface(), width: 36, height: 36, overflow: 'hidden', flexShrink: 0 }}>
                        {order.items?.image_url
                          ? <img src={order.items.image_url} alt={order.items.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: '100%', height: '100%', background: 'var(--surface-bg)' }} />
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...t('body'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.items?.name ?? '—'}</div>
                      </div>
                      <span style={{ ...badge(order.status === 'delivered' ? 'success' : 'default') }}>
                        {order.status === 'delivered' ? 'Delivered' : 'Shipped'}
                      </span>
                      <DisputeBadge order={order} />
                    </div>
                    {order.tracking_number && (
                      <div style={{ ...surface({ pad: '8px 12px' }), display: 'flex', flexDirection: 'column', gap: 4, marginTop: S[2] }}>
                        {order.tracking_carrier && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Carrier</span>
                            <span style={{ ...t('meta'), color: 'var(--text-strong)' }}>{order.tracking_carrier}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Tracking number</span>
                          <span style={{ ...t('meta'), color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{order.tracking_number}</span>
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2], marginTop: S[2], paddingTop: S[2], borderTop: '1px solid var(--divider)', flexWrap: 'wrap' }}>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                        ${price.toFixed(2)} − ${feeUsd.toFixed(2)} fee{shipCost > 0 ? ` − $${shipCost.toFixed(2)} ship` : ''}
                      </span>
                      <span style={{ ...t('meta'), color: C.green }}>You net ${net.toFixed(2)}</span>
                    </div>
                    {order.label_url && (
                      <a href={order.label_url} target="_blank" rel="noopener noreferrer"
                        style={{ ...t('meta'), display: 'inline-flex', alignItems: 'center', gap: S[1], color: 'var(--text-strong)', textDecoration: 'none', marginTop: S[2] }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        Print shipping label
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Revenue stats ── */}
      <div style={{ ...card({ pad: S[4] }), marginBottom: S[6] }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
          {[
            { label: 'Total Revenue',  value: `$${totalRevenue.toFixed(2)}`, color: C.green },
            { label: 'Items Sold',     value: String(sales.length),          color: 'var(--text-strong)' },
            { label: 'Avg Sale Price', value: sales.length ? `$${avgPrice.toFixed(2)}` : '—', color: 'var(--text-strong)' },
            { label: 'Network',        value: 'Solana',                      color: 'var(--text-strong)' },
          ].map(s => (
            <div key={s.label} style={{ ...surface({ pad: '14px 12px' }) }}>
              <div style={{ ...t('title'), color: s.color, marginBottom: S[1] }}>{s.value}</div>
              <div style={{ ...sectionLabel() }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {sales.length === 0 ? (
        <EmptyState
          icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
          title="No sales yet"
          message="List an item on the Sell page to get started."
          action={{ label: 'List an item', href: '/dashboard/seller' }}
        />
      ) : (
        <>
          <div style={{ ...sectionLabel(), marginBottom: S[3] }}>
            Completed Sales · {sales.length}
          </div>
          {sales.map((sale: any, i: number) => {
            const item   = sale.items;
            if (!item) return null;
            const date   = new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const txHash = sale.tx_hash ?? '';
            const method = txHash.startsWith('pi_') || txHash.startsWith('stripe_') ? 'Card'
                         : txHash.length > 0 ? 'Crypto' : '—';
            return (
              <Link key={sale.id} href={`/item/${item.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
                  <div style={{ ...surface(), width: 52, height: 52, overflow: 'hidden', flexShrink: 0 }}>
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginTop: S[1], flexWrap: 'wrap' }}>
                      <span style={{ ...badge('success') }}>SOLD</span>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{method}</span>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{date}</span>
                    </div>
                    {sale.owner_wallet && (
                      <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>
                        {'→ '}
                        <UserLink wallet={sale.owner_wallet} viewerWallet={wallet} style={{ color: 'inherit' }}>
                          {shortWallet(sale.owner_wallet)}
                        </UserLink>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...t('heading'), color: C.green }}>
                      {sale.price_usdc ? `+$${Number(sale.price_usdc).toFixed(2)}` : '—'}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </>
      )}

      {shipOrder && (
        <ShipLabelFlow
          order={shipOrder}
          onClose={() => setShipOrder(null)}
          onShipped={(updated) => {
            setSellerOrders(prev => prev.map(o => o.id === shipOrder.id ? { ...o, ...updated } as Order : o));
            setShipOrder(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inline payment-request preview card (B3) — a pending request between the two people in this
// thread, shown in place in the message flow instead of only being visible in the generic
// Pay/Request sheet. Decline (and Cancel, for the requester's own outgoing request) call the SAME
// endpoint the old sheet used (PATCH /api/transfer/request). Accept opens that same sheet, already
// addressed to the right person — paying still needs the full sign/confirm flow that lives there,
// so this card previews + routes rather than re-implementing custody-sensitive signing.
type PaymentRequestRow = {
  id: string;
  requester_wallet: string;
  payer_wallet: string;
  token: string;
  amount: number;
  note: string | null;
  status: string;
  created_at: string;
  other: { display_name: string | null; avatar_url: string | null } | null;
};

function RequestCard({ r, wallet, busy, onRespond, onAccept }: {
  r: PaymentRequestRow;
  wallet: string;
  busy: boolean;
  onRespond: (id: string, action: 'decline' | 'cancel') => void;
  onAccept: () => void;
}) {
  const isPayer = r.payer_wallet === wallet;
  const otherLabel = r.other?.display_name || shortWallet(isPayer ? r.requester_wallet : r.payer_wallet);
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ ...surface({ pad: S[3], radius: 16 }), width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
          <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>
            {isPayer ? `${otherLabel} requested` : `You requested from ${otherLabel}`}
          </span>
          <span style={{ ...badge('default') }}>Pending</span>
        </div>
        <div style={{ ...t('title'), color: 'var(--text-strong)' }}>{r.amount} {r.token}</div>
        {r.note && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{r.note}</div>}
        <div style={{ display: 'flex', gap: S[2] }}>
          {isPayer ? (
            <>
              <button onClick={() => onRespond(r.id, 'decline')} disabled={busy} style={{ ...btn('secondary'), flex: 1, fontSize: 13, padding: '8px 12px' }}>Decline</button>
              <button onClick={onAccept} disabled={busy} style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '8px 12px' }}>Accept</button>
            </>
          ) : (
            <button onClick={() => onRespond(r.id, 'cancel')} disabled={busy} style={{ ...btn('secondary'), flex: 1, fontSize: 13, padding: '8px 12px' }}>Cancel request</button>
          )}
        </div>
        <Link href={`/request/${r.id}`} style={{ ...t('meta'), color: 'var(--text-strong)', textAlign: 'center', textDecoration: 'underline' }}>View request</Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MESSAGES tab
// ─────────────────────────────────────────────────────────────
function MessagesTab({ wallet, initialConv }: { wallet: string; initialConv?: string }) {
  const { getAccessToken } = usePrivy();
  const [activeConv, setActiveConv] = useState<string | null>(initialConv ?? null);
  const [sending, setSending] = useState(false);
  const [offerMax, setOfferMax] = useState<number | null>(null);
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);

  const { data: conversations = [], isLoading, refetch } = trpc.messages.getConversations.useQuery(
    { wallet },
    { enabled: !!wallet, refetchInterval: 15000 }
  );

  const { data: thread = [], isLoading: threadLoading, refetch: refetchThread } = trpc.messages.getThread.useQuery(
    { wallet_a: wallet, wallet_b: activeConv ?? '' },
    { enabled: !!wallet && !!activeConv, refetchInterval: 8000 }
  );

  const { data: requestsData, refetch: refetchRequests } = trpc.transfers.requests.useQuery(
    { wallet },
    { enabled: !!wallet, refetchInterval: 15000 }
  );

  const threadRequests: PaymentRequestRow[] = [
    ...((requestsData?.incoming ?? []) as PaymentRequestRow[]),
    ...((requestsData?.outgoing ?? []) as PaymentRequestRow[]),
  ].filter(r => r.status === 'pending' && activeConv && (
    (r.requester_wallet === activeConv && r.payer_wallet === wallet) ||
    (r.requester_wallet === wallet && r.payer_wallet === activeConv)
  ));

  async function respondRequest(request_id: string, action: 'decline' | 'cancel') {
    setRespondingRequestId(request_id);
    try {
      const token = await getAccessToken();
      await fetch('/api/transfer/request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ request_id, action }),
      });
    } catch {
      // non-fatal — refetch reflects the true state
    } finally {
      setRespondingRequestId(null);
      refetchRequests();
    }
  }

  // Open a conversation: mark messages from that partner as read via authed API route.
  async function openConv(partnerWallet: string) {
    setActiveConv(partnerWallet);
    try {
      const token = await getAccessToken();
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, from_wallet: partnerWallet }),
      });
      refetch();
    } catch {
      // non-fatal — unread count is cosmetic
    }
  }

  // If initialConv is set and conversations have loaded, mark it read immediately.
  useEffect(() => {
    if (initialConv && wallet) {
      openConv(initialConv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConv, wallet]);

  async function sendMessage(content: string, preset?: MessagePreset) {
    if (!content.trim() || !activeConv || sending) return;
    setSending(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ from_wallet: wallet, to_wallet: activeConv, content: content.trim(), preset: preset ?? undefined }),
      });
      if (res.ok) {
        refetch();
        refetchThread();
      }
    } finally {
      setSending(false);
    }
  }

  // Offer slider tops out at the listing price of the item this thread is about (latest message that
  // carries an item_id), so a buyer can't "offer" more than asking. No item context → free range.
  useEffect(() => {
    const withItem = [...thread].reverse().find((m: any) => m.item_id);
    if (!withItem?.item_id) { setOfferMax(null); return; }
    let cancelled = false;
    fetch(`/api/item/${withItem.item_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((it) => { if (!cancelled && it?.price_usdc != null) setOfferMax(Number(it.price_usdc)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [thread]);

  if (isLoading) return (
    <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {[1,2,3].map(i => <div key={i} style={{ ...card(), height: 72, animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (activeConv) {
    const partnerConv = conversations.find((c: any) => c.partner_wallet === activeConv);
    const displayName = partnerConv?.partner_name ?? `${activeConv.slice(0,6)}…${activeConv.slice(-4)}`;
    return (
      <div style={{ paddingTop: S[4], display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
        <button onClick={() => setActiveConv(null)} style={{ ...btn('text'), gap: S[2], marginBottom: S[4], padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to conversations
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2], marginBottom: S[3] }}>
          <Link
            href={activeConv === wallet ? '/profile' : `/p/${activeConv}`}
            style={{ ...t('heading'), color: 'var(--text-strong)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
          >
            {displayName}
          </Link>
          <button
            onClick={() => setShowPaySheet(true)}
            style={{ ...btn('secondary'), gap: S[2], padding: '8px 14px', flexShrink: 0 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Pay / Request
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: S[2], marginBottom: S[3] }}>
          {[
            ...thread.map((msg: any) => ({ kind: 'message' as const, at: msg.created_at, msg })),
            ...threadRequests.map((r) => ({ kind: 'request' as const, at: r.created_at, r })),
          ]
            .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
            .map((entry) => {
              if (entry.kind === 'request') {
                return (
                  <RequestCard
                    key={`req-${entry.r.id}`}
                    r={entry.r}
                    wallet={wallet}
                    busy={respondingRequestId === entry.r.id}
                    onRespond={respondRequest}
                    onAccept={() => setShowPaySheet(true)}
                  />
                );
              }
              const msg = entry.msg;
              const isMine = msg.from_wallet === wallet;
              return (
                <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '72%', ...(isMine ? { background: T.gradBrand } : surface({ radius: 18 })), borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px', padding: '10px 14px' }}>
                    <StructuredBubble content={msg.content} preset={msg.preset} mine={isMine} />
                    <div style={{ ...t('meta'), color: isMine ? 'rgba(255,255,255,.7)' : 'var(--text-muted)', marginTop: S[1] }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              );
            })}
          {thread.length === 0 && threadRequests.length === 0 && !threadLoading && <div style={{ textAlign: 'center', ...t('meta'), color: 'var(--text-muted)', paddingTop: S[5] }}>Start the conversation</div>}
        </div>
        <PresetComposer onSend={sendMessage} sending={sending} maxOffer={offerMax} />

        {showPaySheet && typeof document !== 'undefined' && createPortal(
          <>
            <div onClick={() => setShowPaySheet(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--modal-scrim)' }} />
            <div style={{ ...sheet({ radius: '30px 30px 0 0' }), position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 600, zIndex: 201, borderBottom: 'none', padding: `0 ${S[5]}px ${S[7]}px`, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: `${S[4]}px 0 ${S[4]}px` }}>
                <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2 }} />
                <button onClick={() => setShowPaySheet(false)} aria-label="Close" style={{ position: 'absolute', right: 0, top: S[3], background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <PayRequest wallet={wallet} fixedRecipient={{ wallet: activeConv, display_name: displayName }} onDone={() => setShowPaySheet(false)} />
            </div>
          </>,
          document.body,
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingTop: S[4] }}>
      {conversations.length === 0 ? (
        <EmptyState
          icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
          title="No messages yet"
          message="Buyers can message you from item pages. Conversations will show up here."
          action={{ label: 'Browse the market', href: '/' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {conversations.map((conv: any) => (
            <button key={conv.partner_wallet} onClick={() => openConv(conv.partner_wallet)}
              style={{ ...surface({ pad: '12px 16px' }), display: 'flex', alignItems: 'center', gap: S[3], cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <div style={{ ...avatar('md'), width: 44, height: 44, background: T.gradBrand }}>
                {(conv.partner_name ?? conv.partner_wallet).slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: S[2], marginBottom: S[1] }}>
                  {/* The whole row opens the thread — the name here is plain text, not a profile link
                      (the profile link lives on the header once inside the thread). */}
                  <span style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                    {conv.partner_name ?? shortWallet(conv.partner_wallet)}
                  </span>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(conv.last_at).toLocaleDateString()}</div>
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.last_message}</div>
              </div>
              {conv.unread > 0 && (
                <div style={{ ...avatar('sm'), width: 20, height: 20, ...t('micro'), background: T.gradBrand }}>{conv.unread}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
function DashboardInner() {
  const { ready, authenticated } = usePrivy();
  const { address: wallet }      = useVisbWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('notifications');
  const [msgTarget, setMsgTarget] = useState<string | undefined>(undefined);

  // ?msg=<wallet> deep-link: switch to Messages tab and pre-open that conversation.
  // ?tab=<sales|purchases|messages|notifications> deep-link: open that tab directly.
  useEffect(() => {
    const msg = searchParams.get('msg');
    if (msg) {
      setTab('messages');
      setMsgTarget(msg);
      return;
    }
    const tp = searchParams.get('tab');
    if (tp === 'sales' || tp === 'purchases' || tp === 'messages' || tp === 'notifications') {
      setTab(tp as Tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (ready && !authenticated) router.push('/login');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return (
      <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Sales history + purchases live in the three-bar menu now; here we only tab between
  // notifications and messages. Sales/purchases still render as focused views via ?tab=.
  const TABS: { id: Tab; label: string }[] = [
    { id: 'messages',      label: 'Messages'      },
    { id: 'notifications', label: 'Notifications' },
  ];
  const pageTitle = tab === 'sales' ? 'Sales History' : tab === 'purchases' ? 'Purchases' : 'Notifications';
  const showSlider = tab === 'notifications' || tab === 'messages';

  const slider = tabSlider();

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3] }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
            <div style={{ ...t('title'), color: 'var(--text-strong)' }}>{pageTitle}</div>
            <HeaderMenu />
          </div>

          {/* Tab slider — notifications / messages only */}
          {showSlider && (
            <div style={{ ...slider.wrap, marginTop: S[3] }}>
              {TABS.map(tb => (
                <button key={tb.id} onClick={() => setTab(tb.id)}
                  style={{ ...slider.item, ...(tab === tb.id ? slider.itemActive : null) }}>
                  {tb.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="visby-inner" style={{ paddingBottom: 100 }}>
        {tab === 'notifications' && <NotificationsTab wallet={wallet} />}
        {tab === 'sales'         && <SalesTab wallet={wallet} />}
        {tab === 'purchases'     && <PurchasesTab wallet={wallet} />}
        {tab === 'messages'      && <MessagesTab wallet={wallet} initialConv={msgTarget} />}
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin   { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// useSearchParams (?msg= deep-link) requires a Suspense boundary in the App Router.
export default function NotificationsPage() {
  return (
    <Suspense fallback={<div style={{ background: 'transparent', minHeight: '100vh' }} />}>
      <DashboardInner />
    </Suspense>
  );
}
