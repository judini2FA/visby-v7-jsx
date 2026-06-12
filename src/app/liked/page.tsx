'use client';

import { useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { t, S, price, card, btn, badge, avatar } from '@/lib/ui';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6DE4D5,#59B4F5)',
  'linear-gradient(135deg,#59B4F5,#D54AF2)',
  'linear-gradient(135deg,#D54AF2,#FFC6A3)',
  'linear-gradient(135deg,#5ED9D1,#9BE15D)',
];

function shortAddr(addr?: string) {
  if (!addr) return '';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function LikedPage() {
  const { wallets } = useSolanaWallets();
  const wallet = wallets?.[0]?.address ?? '';
  const router = useRouter();
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
      </div>

      <div className="visby-inner" style={{ maxWidth: 600, margin: '0 auto', padding: `${S[4]}px ${S[4]}px 100px` }}>
        {isLoading && (
          <div className="visby-grid">
            {[1,2,3,4].map(i => <div key={i} style={{ ...card({ radius: 'var(--r-lg)' }), height: 200, animation: 'pulse 2s infinite' }} />)}
          </div>
        )}
        {!isLoading && items.length === 0 && !wallet && (
          <div style={{ textAlign: 'center', padding: `${S[8]}px ${S[5]}px` }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[4] }}>Sign in to see liked items</div>
            <Link href="/login" style={{ ...btn('primary'), textDecoration: 'none' }}>Sign In</Link>
          </div>
        )}
        {!isLoading && items.length === 0 && !!wallet && (
          <div style={{ textAlign: 'center', padding: `${S[8]}px ${S[5]}px` }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[2] }}>No liked items yet</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[5] }}>Tap the heart on any listing to save it here</div>
            <Link href="/marketplace" style={{ ...btn('primary'), textDecoration: 'none' }}>Browse listings</Link>
          </div>
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
                  {item.condition && <span style={{ ...badge('onImage'), position: 'absolute', top: S[3], left: S[3] }}>{item.condition}</span>}
                </div>
                <div style={{ padding: S[4], display: 'flex', flexDirection: 'column', gap: S[2], flex: 1 }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                    <div style={{ ...avatar('sm'), width: 22, height: 22, fontSize: 10, background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}>{(item.name ?? '?').slice(0, 1).toUpperCase()}</div>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{shortAddr(item.current_owner_wallet)}</span>
                  </div>
                  <div style={{ ...price('md'), marginTop: S[1] }}>${(item.price_usdc ?? 0).toLocaleString()}</div>
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
