'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, btn, surface, sectionLabel, tabSlider } from '@/lib/ui';
import { useCurrency, CURRENCIES } from '@/lib/currency';
import PaymentMethodsManager from '@/components/payment-methods-manager';
import PayoutSettings from '@/components/payout-settings';
import ShipFromSettings from '@/components/ship-from-settings';
import PendingPayouts from '@/components/pending-payouts';
import { SellerAnalytics } from '@/components/seller-analytics';
import { TallyWallets } from '@/components/tally-wallets';
import { HeaderMenu } from '@/components/layout/header-menu';

type WTab = 'wallets' | 'payouts';

export default function WalletPage() {
  const { ready, authenticated, exportWallet } = usePrivy();
  const { address: wallet, ready: walletReady } = useVisbWallet();
  const router = useRouter();
  const { currency, setCurrency } = useCurrency();
  const [tab, setTab] = useState<WTab>('wallets');

  useEffect(() => {
    const tp = new URLSearchParams(window.location.search).get('tab');
    if (tp === 'payouts' || tp === 'wallets') setTab(tp as WTab);
  }, []);

  useEffect(() => {
    if (ready && !authenticated) router.push('/login');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated || !walletReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--text-muted)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const TABS: { id: WTab; label: string }[] = [
    { id: 'wallets', label: 'Wallets' },
    { id: 'payouts', label: 'Details' },
  ];

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center' }}>
          <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Wallet</div>
          <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingTop: S[4], paddingBottom: 120 }}>
        {/* Tab slider */}
        <div style={tabSlider().wrap}>
          {TABS.map(tt => (
            <button key={tt.id} onClick={() => setTab(tt.id)}
              style={{ ...tabSlider().item, ...(tab === tt.id ? tabSlider().itemActive : null) }}>
              {tt.label}
            </button>
          ))}
        </div>

        {tab === 'wallets' && (
          <div style={{ paddingTop: S[5] }}>
            <PaymentMethodsManager wallet={wallet} onExportWallet={exportWallet} />
          </div>
        )}

        {tab === 'payouts' && (
          <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[5] }}>
            {/* Tally destination + connected wallets block */}
            <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
              <TallyWallets visbyWallet={wallet} />
            </div>

            {/* Payout settings block */}
            <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
              <PayoutSettings wallet={wallet} />
            </div>

            {/* Ship-from address block */}
            <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
              <ShipFromSettings wallet={wallet} />
            </div>

            {/* Pending payouts — self-contained card, only shows when there's something to retry */}
            <PendingPayouts wallet={wallet} />

            {/* Sales analytics block */}
            <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
              <div style={{ ...sectionLabel(), marginBottom: S[4] }}>Sales analytics</div>
              <SellerAnalytics wallet={wallet} />
            </div>

            {/* Currency settings block */}
            <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
              <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>Currency settings</div>
              <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[3] }}>
                Prices show in this currency; payouts settle in USDC / SOL.
              </div>
              <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                {CURRENCIES.map(c => (
                  <button key={c} onClick={() => setCurrency(c)}
                    style={{ ...btn(currency === c ? 'primary' : 'secondary'), padding: '7px 14px', ...(currency === c ? {} : { color: 'var(--text-muted)' }) }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
