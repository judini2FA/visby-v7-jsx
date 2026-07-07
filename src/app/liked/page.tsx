'use client';

import { useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { t, S, price, card, btn, badge, avatar } from '@/lib/ui';
import { useCurrency } from '@/lib/currency';
import { HeaderMenu } from '@/components/layout/header-menu';
import { EmptyState } from '@/components/empty-state';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#25CDB8,#2A8AED)',
  'linear-gradient(135deg,#2A8AED,#BC2DE6)',
  'linear-gradient(135deg,#BC2DE6,#FFC6A3)',
  'linear-gradient(135deg,#22C6B7,#9BE15D)',
];

function shortAddr(addr?: string) {
  if (!addr) return '';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function LikedPage() {
  const { wallets } = useSolanaWallets();
  const wallet = wallets?.[0]?.address ?? '';
  const router = useRouter();
  const { format: fmtPrice } = useCurrency();
  const { data: items = [], isLoading } = trpc.likes.getLikedByWallet.useQuery(
    { wallet },
    { enabled: !!wallet }
  );

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)', padding: `${S[3]}px ${S[4]}px`, display: 'flex', alignItems: 'center', gap: S[3] }}>
        <button onClick={() => router.back()} style={{ ...btn('secondary', { pill: false }), padding: `${S[2]}px ${S[2]}px`, display: 'flex', alignItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Liked Items</div>
        <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
      </div>

      <div className="visby-inner" style={{ maxWidth: 600, margin: '0 auto', padding: `${S[4]}px ${S[4]}px 100px` }}>
        {isLoading && (
          <div className="visby-grid">
            {[1,2,3,4].map(i => <div key={i} style={{ ...card({ radius: 'var(--r-lg)' }), height: 200, animation: 'pulse 2s infinite' }} />)}
          </div>
        )}
        {!isLoading && items.length === 0 && !wallet && (
          <EmptyState
            icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
            title="Sign in to see liked items"
            message="Your saved items will show up here once you're signed in."
            action={{ label: 'Sign In', href: '/login' }}
          />
        )}
        {!isLoading && items.length === 0 && !!wallet && (
          <EmptyState
            icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
            title="No liked items yet"
            message="Tap the heart on any listing to save it here."
            action={{ label: 'Explore the market', href: '/' }}
          />
        )}
        {items.length > 0 && (
          <div className="visby-grid">
            {items.map((item: any, i: number) => (
              <Link key={item.id} href={`/item/${item.id}`} style={{ ...card({ radius: 'var(--r-lg)' }), display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none' }}>
                <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</span>
                  }
                </div>
                <div style={{ padding: S[4], display: 'flex', flexDirection: 'column', gap: S[2], flex: 1 }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                    <div style={{ ...avatar('sm'), width: 22, height: 22, fontSize: 10, background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}>{(item.name ?? '?').slice(0, 1).toUpperCase()}</div>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{shortAddr(item.current_owner_wallet)}</span>
                  </div>
                  <div style={{ ...price('md'), marginTop: S[1] }}>{fmtPrice(item.price_usdc ?? 0)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}
