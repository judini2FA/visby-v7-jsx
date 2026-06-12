'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSolanaWallets } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';

const C = {
  red: '#FF3B5C', cyan: '#6DE4D5', blue: '#59B4F5', mag: '#D54AF2', teal: '#5ED9D1',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
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
  const sellerDisplay = shortAddr(item.current_owner_wallet);
  const sellerInitial = (item.current_owner_wallet[0] ?? '?').toUpperCase();
  const price = item.price_usdc ?? 0;
  const isUsed = (item.transfer_count ?? 0) > 0;

  return (
    <div style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
      WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden',
      border: '1px solid var(--glass-border)',
      boxShadow: 'var(--glass-shadow), var(--glass-inner)',
      fontFamily: "'Manrope',sans-serif",
    }}>
      {/* Seller row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 10px', gap: 9 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: AVATAR_GH[index % AVATAR_GH.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
          {sellerInitial}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {sellerDisplay}
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--glass-bg-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><path d="M2 5l2.5 2.5 3.5-4"/></svg>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>NFT verified · {isUsed ? 'Used' : item.condition}</div>
        </div>
      </div>

      {/* Image area */}
      <Link href={`/item/${item.id}`} style={{ display: 'block', textDecoration: 'none' }}>
        <div style={{ background: 'var(--glass-bg-strong)', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{item.category}</div>
          )}
          {/* Condition pill */}
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.1)' }}>
            {isUsed ? 'Used' : item.condition}
          </div>
          {/* Prev owners badge */}
          {isUsed && (
            <div style={{ position: 'absolute', top: 38, left: 10, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)', borderRadius: 6, padding: '2px 7px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.85)', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {item.transfer_count}
            </div>
          )}
        </div>
      </Link>

      {/* Like row */}
      <div style={{ padding: '10px 14px 6px' }}>
        <button
          onClick={() => { if (myWallet) toggleLike.mutate({ item_id: item.id, wallet: myWallet }); }}
          style={{ background: 'none', border: 'none', cursor: myWallet ? 'pointer' : 'default', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? C.red : 'none'} stroke={liked ? C.red : 'var(--text-muted)'} strokeWidth="1.8" strokeLinecap="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{likeCount}</span>
        </button>
      </div>

      {/* Name + price + CTA */}
      <div style={{ padding: '0 14px 14px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-strong)', marginBottom: 8 }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ${price.toLocaleString()}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--glass-bg)', borderRadius: 6, padding: '3px 8px', border: '1px solid var(--glass-border)' }}>
            {item.category}
          </span>
        </div>
        <Link href={`/item/${item.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', background: GH, borderRadius: 14, padding: '12px 20px', fontWeight: 700, fontSize: 14, color: '#fff', cursor: 'pointer', textDecoration: 'none', boxShadow: '0 2px 12px rgba(0,0,0,.2)' }}>
          Buy Now
        </Link>
      </div>
    </div>
  );
}
