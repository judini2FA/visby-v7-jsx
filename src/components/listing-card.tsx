'use client';

import Link from 'next/link';
import { useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { card, t, price, avatar, badge, S } from '@/lib/ui';

const C = { red: '#FF3B5C', cyan: '#25CDB8', blue: '#2A8AED', mag: '#BC2DE6', teal: '#22C6B7' };
const AVATAR_GH = [
  `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`,
  `linear-gradient(135deg,${C.cyan},${C.teal})`,
  `linear-gradient(135deg,${C.blue},${C.mag})`,
  `linear-gradient(135deg,${C.teal},${C.blue})`,
  `linear-gradient(135deg,${C.mag},${C.blue})`,
];

function shortAddr(addr: string) {
  if (!addr || addr.length < 8) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export interface ListingItem {
  id: string; name: string; serial_number: string;
  condition: string; category: string; description?: string | null;
  image_url?: string | null; current_owner_wallet: string;
  is_listed: boolean; price_usdc?: number | null; created_at: string;
  transfer_count?: number;
}

export function ListingCard({ item, index }: { item: ListingItem; index: number }) {
  const { wallets } = useSolanaWallets();
  const myWallet = wallets?.[0]?.address ?? '';

  const { data: likeData, refetch } = trpc.likes.getByItem.useQuery(
    { item_id: item.id, viewer_wallet: myWallet || undefined },
    { enabled: !!item.id }
  );
  const toggleLike = trpc.likes.toggle.useMutation({ onSuccess: () => refetch() });

  const likeCount = likeData?.count ?? 0;
  const liked = likeData?.liked ?? false;
  const sellerInitial = (item.current_owner_wallet[0] ?? '?').toUpperCase();
  const isUsed = (item.transfer_count ?? 0) > 0;

  return (
    <Link
      href={`/item/${item.id}`}
      style={{ ...card({ radius: 'var(--r-lg)' }), display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none' }}
    >
      {/* Image — the single focal element */}
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</span>
        )}

        <span style={{ ...badge('onImage'), position: 'absolute', top: S[3], left: S[3] }}>
          {isUsed ? 'Used' : item.condition}
        </span>

        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (myWallet) toggleLike.mutate({ item_id: item.id, wallet: myWallet }); }}
          aria-label={liked ? 'Unlike' : 'Like'}
          style={{
            position: 'absolute', top: S[3], right: S[3],
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'var(--img-scrim)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,.18)', borderRadius: 'var(--pill)',
            padding: '5px 9px', cursor: myWallet ? 'pointer' : 'default',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? C.red : 'none'} stroke={liked ? C.red : 'rgba(255,255,255,.92)'} strokeWidth="1.9" strokeLinecap="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.92)' }}>{likeCount}</span>
        </button>
      </div>

      {/* Info */}
      <div style={{ padding: S[4], display: 'flex', flexDirection: 'column', gap: S[2], flex: 1 }}>
        <div style={{ ...t('heading'), color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
          <div style={{ ...avatar('sm'), width: 22, height: 22, fontSize: 10, background: AVATAR_GH[index % AVATAR_GH.length] }}>
            {sellerInitial}
          </div>
          <span style={{ ...t('meta'), color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {shortAddr(item.current_owner_wallet)}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
        </div>
        <div style={{ ...price('md'), marginTop: S[1] }}>
          ${(item.price_usdc ?? 0).toLocaleString()}
        </div>
      </div>
    </Link>
  );
}
