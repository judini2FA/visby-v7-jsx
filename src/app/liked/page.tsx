'use client';

import { useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';

const C = { teal: '#5ED9D1', cyan: '#6DE4D5', blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)' };
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

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
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>Liked Items</div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 100px' }}>
        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height: 200, background: 'var(--glass-bg)', borderRadius: 20, animation: 'pulse 2s infinite' }} />)}
          </div>
        )}
        {!isLoading && items.length === 0 && !wallet && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Sign in to see liked items</div>
            <Link href="/login" style={{ display: 'inline-block', background: GH, borderRadius: 20, padding: '12px 24px', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Sign In</Link>
          </div>
        )}
        {!isLoading && items.length === 0 && !!wallet && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>No liked items yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tap the heart on any listing</div>
          </div>
        )}
        {items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {items.map((item: any) => (
              <Link key={item.id} href={`/item/${item.id}`} style={{ textDecoration: 'none', background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderRadius: 20, overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow), var(--glass-inner)' }}>
                <div style={{ height: 140, background: 'var(--glass-bg-strong)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.category}</span>
                  }
                  <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,59,92,.8)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </div>
                </div>
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>${(item.price_usdc ?? 0).toLocaleString()}</div>
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
