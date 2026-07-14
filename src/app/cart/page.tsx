'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { useCurrency } from '@/lib/currency';
import { t, S, T, price, card, surface, btn } from '@/lib/ui';
import { HeaderMenu } from '@/components/layout/header-menu';
import { EmptyState } from '@/components/empty-state';
import CheckoutModal from '@/components/checkout-modal';
import type { CartItem } from '@/server/routers/cart';

const CartGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

export default function CartPage() {
  const router = useRouter();
  const { address, ready } = useVisbWallet();
  const { format: fmtPrice } = useCurrency();
  const utils = trpc.useUtils();

  const { data: cart = [], isLoading } = trpc.cart.list.useQuery(undefined, { enabled: !!address });
  const removeMutation = trpc.cart.remove.useMutation({
    onSuccess: () => utils.cart.list.invalidate(),
  });

  // Sequential checkout state. `current` drives the open CheckoutModal; `queue` holds the remaining
  // rows for a "Buy all" run. A per-item `key` below forces a full remount between items so the
  // modal's internal payment-status state never leaks from one item to the next.
  const [current, setCurrent] = useState<CartItem | null>(null);
  const [queue, setQueue] = useState<CartItem[]>([]);
  const [isBuyAll, setIsBuyAll] = useState(false);

  const invalidateCart = () => { utils.cart.list.invalidate(); utils.cart.count.invalidate(); };

  function buyNow(row: CartItem) {
    setIsBuyAll(false);
    setQueue([]);
    setCurrent(row);
  }

  function buyAll() {
    if (cart.length === 0) return;
    const [first, ...rest] = cart;
    setIsBuyAll(true);
    setQueue(rest);
    setCurrent(first);
  }

  async function handleSuccess(purchasedItemId: string) {
    // Purchase-empties-cart: the bought item comes out of the cart regardless of single or batch flow.
    try { await removeMutation.mutateAsync({ itemId: purchasedItemId }); } catch {}
    invalidateCart();

    if (isBuyAll && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setCurrent(next);
    } else {
      setCurrent(null);
      setQueue([]);
      setIsBuyAll(false);
    }
  }

  function handleClose() {
    // Closing without a completed purchase stops the queue outright (spec: don't auto-advance).
    setCurrent(null);
    setQueue([]);
    setIsBuyAll(false);
  }

  const subtotal = cart.reduce((sum, row) => sum + (row.item.price_usdc ?? 0), 0);

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <button onClick={() => router.back()} aria-label="Back" style={{ ...btn('secondary', { pill: false }), padding: `${S[2]}px`, display: 'flex', alignItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Cart</div>
          <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
        </div>
      </div>

      <div className="visby-inner" style={{ maxWidth: 600, margin: '0 auto', padding: `${S[4]}px ${S[4]}px 140px` }}>
        {!ready || (isLoading && !!address) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {[1, 2, 3].map((i) => <div key={i} style={{ ...card(), height: 92, animation: 'pulse 2s infinite' }} />)}
          </div>
        ) : !address ? (
          <EmptyState
            icon={<CartGlyph />}
            title="Sign in to see your cart"
            message="Items you add to your cart will be saved to your account and follow you across devices."
            action={{ label: 'Sign In', href: '/login' }}
          />
        ) : cart.length === 0 ? (
          <EmptyState
            icon={<CartGlyph />}
            title="Your cart is empty"
            message="Add items you're considering and check out when you're ready."
            action={{ label: 'Browse the market', href: '/' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {cart.map((row) => (
              <div key={row.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: S[3], padding: S[3] }}>
                <Link href={`/item/${row.item.id}`} style={{ flexShrink: 0 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {row.item.image_url
                      ? <img src={row.item.image_url} alt={row.item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <CartGlyph />
                    }
                  </div>
                </Link>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Link href={`/item/${row.item.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ ...t('heading'), color: T.textStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.item.name}</div>
                  </Link>
                  <div style={price('sm')}>{fmtPrice(row.item.price_usdc ?? 0)}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: S[2], flexShrink: 0 }}>
                  <button
                    onClick={() => removeMutation.mutate({ itemId: row.item_id })}
                    disabled={removeMutation.isPending}
                    aria-label="Remove from cart"
                    style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                  >
                    <TrashIcon />
                  </button>
                  <button onClick={() => buyNow(row)} style={{ ...btn('secondary', { pill: false }), padding: '8px 14px', fontSize: 13 }}>
                    Buy now
                  </button>
                </div>
              </div>
            ))}

            <div style={{ ...surface({ pad: `${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[3], marginTop: S[2] }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ ...t('body'), color: T.textMuted }}>Subtotal ({cart.length} item{cart.length !== 1 ? 's' : ''})</span>
                <div style={price('md')}>{fmtPrice(subtotal)}</div>
              </div>
              <button onClick={buyAll} style={{ ...btn('primary', { full: true }) }}>
                Buy all
              </button>
            </div>
          </div>
        )}
      </div>

      {current && address && (
        <CheckoutModal
          key={current.item_id}
          itemId={current.item.id}
          itemName={current.item.name}
          priceUsdc={current.item.price_usdc ?? 0}
          buyerWallet={address}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}
