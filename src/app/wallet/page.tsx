'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, btn, surface, sectionLabel, tabSlider, badge } from '@/lib/ui';
import { useCurrency, CURRENCIES } from '@/lib/currency';
import { trpc } from '@/lib/trpc/client';
import PayRequest from '@/components/pay-request';
import PaymentMethodsManager from '@/components/payment-methods-manager';
import PayoutSettings from '@/components/payout-settings';
import ShipFromSettings from '@/components/ship-from-settings';
import PendingPayouts from '@/components/pending-payouts';
import { SellerAnalytics } from '@/components/seller-analytics';
import { TallyWallets } from '@/components/tally-wallets';
import { HeaderMenu } from '@/components/layout/header-menu';

type WTab = 'wallets' | 'pay' | 'payouts';

export default function WalletPage() {
  const { ready, authenticated, exportWallet } = usePrivy();
  const { address: wallet, ready: walletReady } = useVisbWallet();
  const router = useRouter();
  const { currency, setCurrency } = useCurrency();
  const [tab, setTab] = useState<WTab>('wallets');
  const historyQ = trpc.transfers.history.useQuery({ wallet }, { enabled: !!wallet });

  useEffect(() => {
    const tp = new URLSearchParams(window.location.search).get('tab');
    if (tp === 'payouts' || tp === 'wallets' || tp === 'pay') setTab(tp as WTab);
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
    { id: 'pay', label: 'Pay' },
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
          <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[5] }}>
            <PaymentMethodsManager wallet={wallet} onExportWallet={exportWallet} />
          </div>
        )}

        {tab === 'pay' && (
          <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[5] }}>
            <PayRequest wallet={wallet} onDone={() => historyQ.refetch()} />
            <TransferHistory wallet={wallet} query={historyQ} />
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

function shortWallet(w: string) {
  return w && w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || '');
}

type TransferRow = {
  direction: 'in' | 'out';
  from_wallet: string;
  to_wallet: string;
  to_handle: string | null;
  token: string;
  amount: number;
  status: string;
  created_at: string;
};

function statusBadge(status: string) {
  if (status === 'sent') return { style: badge('success'), label: 'Sent' };
  if (status === 'failed') return { style: badge('danger'), label: 'Failed' };
  return { style: badge('default'), label: 'Pending' };
}

function DirectionArrow({ direction }: { direction: 'in' | 'out' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'out'
        ? <><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></>
        : <><line x1="17" y1="7" x2="7" y2="17" /><polyline points="17 17 7 17 7 7" /></>}
    </svg>
  );
}

function TransferHistory({ wallet, query }: { wallet: string; query: { data?: TransferRow[] | unknown } }) {
  const rows = (Array.isArray(query.data) ? query.data : []) as TransferRow[];

  return (
    <div style={surface({ pad: S[5], radius: 'var(--r-lg)' })}>
      <div style={{ ...sectionLabel(), marginBottom: S[4] }}>Recent transfers</div>
      {rows.length === 0 ? (
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>No transfers yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {rows.map((r, i) => {
            const out = r.direction === 'out';
            const counterparty = out ? (r.to_handle || shortWallet(r.to_wallet)) : shortWallet(r.from_wallet);
            const sb = statusBadge(r.status);
            const date = new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: S[3], paddingTop: i ? S[2] : 0, ...(i ? { borderTop: '1px solid var(--divider)' } : null) }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: out ? 'var(--text-muted)' : 'var(--ok)', flexShrink: 0 }}>
                  <DirectionArrow direction={r.direction} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...t('body'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {out ? 'To ' : 'From '}{counterparty}
                  </div>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{date}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>
                    {out ? '-' : '+'}{r.amount} {r.token}
                  </div>
                  <span style={sb.style}>{sb.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
