'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { btn } from '@/lib/ui';

const CartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// Self-contained "add to the persistent cart" control — drop it anywhere an item is shown. Owns its
// own cart-membership check and mutation; the caller only needs to know the item and its seller.
// Completely separate from the one-click "buy now" flow, which never touches the cart router.
export function AddToCartButton({ itemId, sellerWallet }: { itemId: string; sellerWallet: string }) {
  const { address, ready } = useVisbWallet();
  const isOwnItem = !!address && address === sellerWallet;
  const [justAdded, setJustAdded] = useState(false);

  const utils = trpc.useUtils();
  const { data: cart } = trpc.cart.list.useQuery(undefined, { enabled: !!address && !isOwnItem });
  const inCart = justAdded || !!cart?.some((row) => row.item_id === itemId);

  const add = trpc.cart.add.useMutation({
    onSuccess: () => {
      setJustAdded(true);
      utils.cart.list.invalidate();
      utils.cart.count.invalidate();
    },
  });

  if (!ready || isOwnItem) return null;

  if (!address) {
    return (
      <Link href="/login" style={{ ...btn('secondary'), textDecoration: 'none' }}>
        <CartIcon /> Add to cart
      </Link>
    );
  }

  if (inCart) {
    return (
      <Link href="/cart" style={{ ...btn('secondary'), textDecoration: 'none' }}>
        <CheckIcon /> In cart
      </Link>
    );
  }

  return (
    <button
      onClick={() => add.mutate({ itemId })}
      disabled={add.isPending}
      style={{ ...btn('secondary'), opacity: add.isPending ? 0.7 : 1, cursor: add.isPending ? 'default' : 'pointer' }}
    >
      <CartIcon /> {add.isPending ? 'Adding…' : 'Add to cart'}
    </button>
  );
}
