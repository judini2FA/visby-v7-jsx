'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';
import CheckoutModal from '@/components/checkout-modal';
import { S, t, price, badge, avatar, sectionLabel, btn } from '@/lib/ui';
import { isCutout } from '@/components/listing-card';
import { useCurrency } from '@/lib/currency';
import { HeaderMenu } from '@/components/layout/header-menu';
import { TallyExplainerCard } from '@/components/tally-explainer';

const C = {
  muted: 'var(--text-muted)', green: 'var(--ok)', red: 'var(--danger)',
};
const GH = 'linear-gradient(90deg,#25CDB8,#2A8AED 50%,#BC2DE6)';

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

interface PendingSerial {
  id: string; name: string; image_url: string | null; price_usdc: number;
  category: string | null; condition: string | null; description: string | null;
  brand: string | null; business_wallet: string; serial_number: string;
  seller: { display_name: string | null; avatar_url: string | null };
}

export default function BusinessItemPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { address: walletAddress, ready: walletReady } = useVisbWallet();
  const { format: fmtPrice } = useCurrency();

  const [item, setItem]       = useState<PendingSerial | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [buyStatus, setBuyStatus] = useState<'idle' | 'done'>('idle');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/pending-serial/${id}`)
      .then(async r => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => { if (d) setItem(d); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--text-muted)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (notFound || !item) return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[4], padding: S[5] }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>This item isn&apos;t available</div>
      <div style={{ ...t('body'), color: C.muted, textAlign: 'center' }}>It may have already sold, or the listing was removed.</div>
      <Link href="/marketplace" style={{ ...btn('secondary') }}>Browse marketplace</Link>
    </div>
  );

  const sellerDisplay = item.seller.display_name || shortAddr(item.business_wallet);
  const sellerAvatar  = item.seller.avatar_url;
  const sellerInitial = (item.business_wallet[0] ?? '?').toUpperCase();

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <Link href="/marketplace" style={{ display: 'flex', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div style={{ ...t('heading'), flex: 1, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <HeaderMenu />
        </div>
      </div>

      {/* Hero image */}
      <div className="visby-inner" style={{ paddingTop: S[4], paddingBottom: 0 }}>
        <div style={{ background: 'var(--surface-bg)', width: '100%', height: 360, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} style={isCutout(item.image_url)
              ? { width: '100%', height: '100%', objectFit: 'contain', padding: 28 }
              : { width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</div>
          )}
          <span style={{ ...badge('onImage'), position: 'absolute', bottom: S[3], left: S[3] }}>
            {item.condition ?? 'New'}
          </span>
          <span style={{ ...badge('onImage'), position: 'absolute', top: S[3], left: S[3] }}>
            Direct from seller
          </span>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingBottom: S[8] + S[7] }}>

        {/* Name + category */}
        <div style={{ paddingTop: S[5], paddingBottom: S[5], borderBottom: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[3], flexWrap: 'wrap' }}>
            {item.category && <span style={{ ...badge('default') }}>{item.category}</span>}
            {/* pending_serials has no serial_status column — brand verification only happens at mint
                time (checkSerial in settlePendingSerialSale), so a brand name here is informational only,
                not yet a verified badge claim. */}
            {item.brand && <span style={{ ...badge('default') }}>{item.brand}</span>}
          </div>
          <h1 style={{ ...t('title'), color: 'var(--text-strong)', margin: 0 }}>{item.name}</h1>
          <div style={{ ...t('meta'), color: C.muted, marginTop: S[2] }}>
            New listing · not yet minted
          </div>
        </div>

        {/* Price + buy */}
        <div style={{ padding: `${S[5]}px 0`, borderBottom: '1px solid var(--divider)' }}>
          <div style={price('lg')}>
            {fmtPrice(item.price_usdc)}
          </div>
          <div style={{ ...sectionLabel(), marginTop: S[2], marginBottom: S[3] }}>USDC</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[4] }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <span style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>All Visby Orders have universal free shipping</span>
          </div>

          {/* Plain-English note about mint-on-sale */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[2], marginBottom: S[5] }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>New — your Tally is minted the moment you buy.</span>
          </div>

          {!walletReady ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
              <span style={{ ...t('body'), color: C.muted }}>Loading wallet…</span>
            </div>
          ) : walletAddress && buyStatus === 'done' ? (
            <div style={{ ...badge('success'), display: 'flex', alignItems: 'center', gap: S[2], padding: S[4], borderRadius: 'var(--r)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ ...t('heading'), color: C.green }}>Purchase complete!</span>
            </div>
          ) : walletAddress ? (
            <>
              <button onClick={() => setShowCheckout(true)} style={btn('primary', { full: true })}>
                Buy Now · ${item.price_usdc.toFixed(2)}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginTop: S[3] }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Seller is paid only after you confirm delivery.</span>
              </div>
            </>
          ) : (
            <Link href="/login" style={btn('primary', { full: true })}>
              Sign In to Buy
            </Link>
          )}
        </div>

        {/* Seller */}
        <div style={{ padding: `${S[5]}px 0`, borderBottom: '1px solid var(--divider)' }}>
          <div style={{ ...sectionLabel(), marginBottom: S[3] }}>Seller</div>
          <Link href={`/p/${item.business_wallet}`} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
              <div style={{ ...avatar('md'), background: sellerAvatar ? 'var(--surface-bg)' : GH }}>
                {sellerAvatar ? <img src={sellerAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : sellerInitial}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>{sellerDisplay}</div>
                <div style={{ ...t('meta'), color: C.muted, marginTop: 2 }}>View seller profile</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </Link>
        </div>

        {/* Description */}
        {item.description && (
          <div style={{ padding: `${S[5]}px 0`, borderBottom: '1px solid var(--divider)' }}>
            <button onClick={() => setShowDesc(s => !s)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>Description</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ transform: showDesc ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showDesc && <div style={{ ...t('body'), color: 'var(--text)', lineHeight: 1.75, marginTop: S[3] }}>{item.description}</div>}
          </div>
        )}

        {/* Tally explainer — no mint address / TallyTracker yet since this item hasn't minted */}
        <div style={{ padding: `${S[5]}px 0` }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-xl)', background: 'var(--grad-tally)', color: '#15121C', boxShadow: '0 14px 34px rgba(30,30,45,.20), inset 0 1px 0 rgba(255,255,255,.75)' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(125deg, rgba(255,255,255,0) 38%, rgba(255,255,255,.45) 50%, rgba(255,255,255,0) 62%), radial-gradient(120% 70% at 12% 0%, rgba(255,255,255,.45), rgba(255,255,255,0) 55%)' }} />
            <div style={{ position: 'relative', padding: S[5] }}>
              <TallyExplainerCard />
              <div style={{ ...t('meta'), color: 'rgba(21,18,28,.68)' }}>
                This item hasn&apos;t minted yet — buying it mints a brand-new Tally, with you as its first owner on record.
              </div>
            </div>
          </div>
        </div>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showCheckout && item && walletAddress && (
        <CheckoutModal
          mode="pending"
          itemId={item.id}
          itemName={item.name}
          priceUsdc={item.price_usdc}
          buyerWallet={walletAddress}
          onClose={() => setShowCheckout(false)}
          onSuccess={(mintedItemId) => {
            setShowCheckout(false);
            setBuyStatus('done');
            router.push(`/order/${mintedItemId}`);
          }}
        />
      )}
    </div>
  );
}
