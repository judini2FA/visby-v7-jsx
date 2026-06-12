'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

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
      <div style={{ minHeight: '100vh', background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--glass-border)', borderTopColor: 'var(--text-muted)', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: "'Manrope',sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pop { 0% { transform: scale(.7); opacity: 0; } 80% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }`}</style>

      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Success header */}
        <div style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: `1px solid ${C.green}33`, borderRadius: 24, boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: '32px 28px', textAlign: 'center', animation: 'pop .4s ease-out' }}>
          {/* Checkmark circle */}
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${C.green}18`, border: `2px solid ${C.green}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>

          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8, lineHeight: 1.2 }}>
            Your order is on its way!
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            NFT provenance has been transferred on Solana.<br/>
            You now own the verified chain of custody for this item.
          </div>

          {pricePaid != null && (
            <div style={{ marginTop: 20, display: 'inline-block', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '10px 20px' }}>
              <span style={{ fontSize: 12, color: C.muted, fontFamily: "'Manrope',sans-serif" }}>Paid </span>
              <span style={{ fontSize: 18, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                ${pricePaid.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Item card */}
        {item && (
          <div style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: `1px solid ${C.border}`, borderRadius: 24, boxShadow: 'var(--glass-shadow), var(--glass-inner)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 0 }}>
              {/* Image */}
              <div style={{ width: 110, flexShrink: 0, background: 'var(--glass-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <CatIcon />}
              </div>
              {/* Info */}
              <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.3 }}>{item.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '2px 8px', color: C.muted, fontFamily: "'Manrope',sans-serif" }}>{item.category}</span>
                  <span style={{ fontSize: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '2px 8px', color: C.muted, fontFamily: "'Manrope',sans-serif" }}>{item.condition}</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Manrope',sans-serif", marginTop: 2 }}>
                  S/N {item.serial_number}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NFT Provenance block */}
        <div style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: `1px solid ${C.border}`, borderRadius: 24, boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>NFT Provenance Transferred</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Ownership recorded on Solana blockchain</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 10, height: 10, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          </div>

          {txHash && (
            <div style={{ background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Manrope',sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Transaction
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--text)', fontFamily: "'Manrope',sans-serif", wordBreak: 'break-all' }}>
                  {txHash}
                </div>
                <button onClick={copyTx}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: copied ? C.green : 'var(--text-muted)', flexShrink: 0, fontSize: 12 }}>
                  {copied
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  }
                </button>
                {solscanUrl && (
                  <a href={solscanUrl} target="_blank" rel="noopener noreferrer"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', flexShrink: 0, fontSize: 11, textDecoration: 'none', fontFamily: "'Manrope',sans-serif" }}>
                    ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {walletAddress && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: C.muted, fontFamily: "'Manrope',sans-serif" }}>Owner</span>
              <span style={{ color: 'var(--text)', fontFamily: "'Manrope',sans-serif" }}>{shortAddr(walletAddress)}</span>
            </div>
          )}
        </div>

        {/* Shipping tracking — placeholder */}
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: `1px dashed ${C.border}`, borderRadius: 24, boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Shipping Tracking</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Coming soon — track your shipment here</div>
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--divider)' }} />
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
            Once the seller ships your item, tracking information will appear here so you can follow it all the way to your door.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/dashboard" style={{ flex: 1, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: '13px', fontWeight: 600, fontSize: 14, color: 'var(--text)', cursor: 'pointer', fontFamily: "'Manrope',sans-serif", textAlign: 'center', textDecoration: 'none', display: 'block' }}>
            My Collection
          </Link>
          <Link href="/" style={{ flex: 1, background: GH, border: 'none', borderRadius: 20, padding: '13px', fontWeight: 800, fontSize: 14, color: '#fff', cursor: 'pointer', fontFamily: "'Manrope',sans-serif", textAlign: 'center', textDecoration: 'none', display: 'block' }}>
            Keep Shopping
          </Link>
        </div>

      </div>
    </div>
  );
}
