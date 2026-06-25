'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, price, surface, sectionLabel, badge } from '@/lib/ui';

const C = { green: 'var(--ok)' };

interface PerItem {
  id: string;
  name: string;
  image_url: string | null;
  is_listed: boolean;
  price_usdc: number | null;
  view_count: number;
  likes: number;
}
interface Analytics {
  grossRevenue: number;
  netEarnings: number;
  platformFees: number;
  itemsSold: number;
  avgSalePrice: number;
  pendingCount: number;
  pendingGross: number;
  refundedCount: number;
  activeListings: number;
  totalViews: number;
  totalLikes: number;
  perItem: PerItem[];
}

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

function EyeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function SellerAnalytics({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/seller/analytics?wallet=${encodeURIComponent(wallet)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) setData(json.analytics ?? null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, getAccessToken]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
        {[1,2,3,4].map(i => <div key={i} style={{ height: 76, background: 'var(--glass-bg)', borderRadius: 'var(--r-sm)', animation: 'pulse 2s infinite' }} />)}
      </div>
      {[1,2,3].map(i => <div key={i} style={{ height: 64, background: 'var(--glass-bg)', borderRadius: 'var(--r-sm)', animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  const a = data;
  const isEmpty = !a || (a.perItem.length === 0 && a.itemsSold === 0 && a.pendingCount === 0);

  if (isEmpty) return (
    <div style={{ textAlign: 'center', paddingTop: S[7], paddingBottom: S[7], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>No activity yet</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Mint and list an item to start tracking views, likes, and revenue</div>
    </div>
  );

  const tiles: { label: string; value: string; sub?: string; money?: boolean }[] = [
    { label: 'Gross revenue', value: money(a.grossRevenue), money: true },
    { label: 'Net earned',    value: money(a.netEarnings),  money: true },
    { label: 'Items sold',    value: String(a.itemsSold) },
    { label: 'Avg sale',      value: money(a.avgSalePrice), money: true },
    { label: 'Active listings', value: String(a.activeListings) },
    { label: 'Total views',   value: String(a.totalViews) },
    { label: 'Total likes',   value: String(a.totalLikes) },
    { label: 'Pending',       value: String(a.pendingCount), sub: money(a.pendingGross) },
    { label: 'Platform fees', value: money(a.platformFees) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[6] }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
        {tiles.map(s => (
          <div key={s.label} style={{ ...surface({ pad: '14px 14px' }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('title'), color: s.money ? C.green : 'var(--text-strong)' }}>{s.value}</div>
            <div style={sectionLabel()}>{s.label}</div>
            {s.sub && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{s.sub} pending</div>}
          </div>
        ))}
      </div>

      {a.refundedCount > 0 && (
        <div style={{ ...surface({ pad: '12px 14px' }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Refunded / cancelled orders</div>
          <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>{a.refundedCount}</div>
        </div>
      )}

      {a.perItem.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div style={sectionLabel()}>Item Performance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {a.perItem.map(item => (
              <div key={item.id} style={{ ...surface({ pad: '12px 14px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
                <div style={{ ...surface({ radius: 'var(--r-sm)' }), width: 44, height: 44, overflow: 'hidden', flexShrink: 0 }}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                      </div>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S[1] }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[3], color: 'var(--text-muted)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: S[1], ...t('meta') }}><EyeIcon />{item.view_count}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: S[1], ...t('meta') }}><HeartIcon />{item.likes}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: S[1] }}>
                  <span style={{ ...badge(item.is_listed ? 'success' : 'default') }}>{item.is_listed ? 'Listed' : 'Unlisted'}</span>
                  {item.price_usdc != null && <div style={price('sm')}>{money(item.price_usdc)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
