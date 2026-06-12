'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';
import { S, t, price, card, surface, btn, sectionLabel } from '@/lib/ui';

const GREEN = '#00C48C';

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

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

const CatIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

export default function OrderPage() {
  const { itemId } = useParams() as { itemId: string };
  const router = useRouter();
  const { address: walletAddress } = useVisbWallet();

  const [item, setItem]   = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    if (!itemId) return;
    fetch(`/api/item/${itemId}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setItem(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [itemId]);

  // The transfer that just happened — most recent ownership entry
  const transfer = item?.ownership_history
    ?.filter(h => h.event_type === 'transfer')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  const txHash   = transfer?.tx_hash ?? '';
  const pricePaid = transfer?.price_usdc;
  const isSolTx  = txHash.length > 40 && !txHash.startsWith('pi_') && !txHash.startsWith('stripe_');
  const solscanUrl = isSolTx ? `https://solscan.io/tx/${txHash}?cluster=devnet` : null;

  function copyTx() {
    navigator.clipboard.writeText(txHash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--glass-border)', borderTopColor: 'var(--text-muted)', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${S[6]}px ${S[4]}px` }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pop { 0% { transform: scale(.7); opacity: 0; } 80% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }`}</style>

      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: S[5] }}>

        {/* Success header */}
        <div style={{ ...card(), padding: S[6], textAlign: 'center', animation: 'pop .4s ease-out' }}>
          <div style={{ ...surface({ radius: '50%' }), width: 72, height: 72, background: 'rgba(0,196,140,.12)', border: '1px solid rgba(0,196,140,.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `0 auto ${S[5]}px` }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>

          <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[2] }}>
            Your order is on its way!
          </div>
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
            You now own the verified chain of custody for this item.
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
              {/* Image */}
              <div style={{ width: 110, flexShrink: 0, background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <CatIcon />}
              </div>
              {/* Info */}
              <div style={{ flex: 1, padding: S[4], display: 'flex', flexDirection: 'column', gap: S[2] }}>
                <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>{item.name}</div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{item.category} · {item.condition}</div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  S/N {item.serial_number}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Provenance / receipt */}
        <div style={{ ...card(), padding: S[4], display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <div style={sectionLabel()}>Provenance</div>

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
              <span style={{ ...t('meta'), color: 'var(--text)' }}>{shortAddr(walletAddress)}</span>
            </div>
          )}
        </div>

        {/* Shipping tracking — placeholder */}
        <div style={{ ...card(), padding: S[4], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <div style={{ ...surface(), width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Shipping</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
              Tracking will appear here once the seller ships your item.
            </div>
          </div>
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
