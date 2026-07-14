'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card, surface, btn, badge, tabSlider, input } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

type Item = {
  id: string;
  name: string | null;
  category: string | null;
  condition: string | null;
  price_usdc: number | null;
  is_listed: boolean;
  current_owner_wallet: string | null;
  serial_number: string | null;
  serial_status?: string | null;
  brand?: string | null;
  image_url: string | null;
  view_count?: number | null;
  created_at: string;
};

const money = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortW = (w: string | null | undefined) =>
  w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w || '—';
const cap = (s: string | null | undefined) =>
  s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

export default function AdminListings() {
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();

  const [filter, setFilter] = useState<'listed' | 'all'>('listed');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready || !wallet) return;
    setErr('');
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ wallet, filter });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/admin/listings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setItems(d.items ?? []);
    } catch (e: any) {
      setErr(friendlyError(e, 'Failed to load — try again.'));
      setItems([]);
    }
  }, [ready, wallet, getAccessToken, filter, q]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) void load();
    }, q ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, q]);

  const toggle = async (item: Item) => {
    if (!wallet) return;
    const next = !item.is_listed;
    setBusy(item.id);
    setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/admin/listings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, id: item.id, is_listed: next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Update failed');
      setItems((prev) =>
        prev
          ? prev
              .map((it) => (it.id === item.id ? { ...it, is_listed: next } : it))
              .filter((it) => (filter === 'listed' ? it.is_listed : true))
          : prev,
      );
    } catch (e: any) {
      setErr(friendlyError(e, 'Update failed — try again.'));
    } finally {
      setBusy(null);
    }
  };

  const tab = tabSlider();

  return (
    <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 120 }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[4] }}>Listings</div>

      <div style={{ display: 'flex', gap: S[3], marginBottom: S[4], flexWrap: 'wrap' }}>
        <div style={{ ...tab.wrap, flex: '0 0 auto', minWidth: 180 }}>
          {(['listed', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ ...tab.item, ...(filter === f ? tab.itemActive : null) }}
            >
              {f === 'listed' ? 'Listed' : 'All'}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, category, brand"
          style={{ ...input(), flex: 1, minWidth: 200 }}
        />
      </div>

      {err && (
        <div style={{ ...surface({ pad: S[4] }), color: 'var(--danger)', marginBottom: S[4] }}>{err}</div>
      )}
      {items === null && !err && (
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Loading…</div>
      )}
      {items !== null && items.length === 0 && !err && (
        <div style={{ ...surface({ pad: S[5] }), ...t('meta'), color: 'var(--text-muted)', textAlign: 'center' }}>
          {q ? 'No items match your search.' : filter === 'listed' ? 'No active listings.' : 'No items yet.'}
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{ ...card({ pad: S[3], radius: 'var(--r-lg)' }), display: 'flex', alignItems: 'center', gap: S[3] }}
            >
              <div
                style={{
                  ...surface({ pad: 0, radius: 'var(--r)' }),
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image_url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    ...t('body'),
                    color: 'var(--text-strong)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {it.name || 'Untitled item'}
                </div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: 2 }}>
                  {[cap(it.category), it.condition ? cap(it.condition) : '', money(it.price_usdc)]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div style={{ ...t('micro'), color: 'var(--text-muted)', marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>
                  Owner {shortW(it.current_owner_wallet)}
                  {it.serial_number ? ` · ${it.serial_number}` : ''}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: S[2], flexShrink: 0 }}>
                <span style={it.is_listed ? badge('success') : badge('default')}>
                  {it.is_listed ? 'Listed' : 'Unlisted'}
                </span>
                <button
                  onClick={() => toggle(it)}
                  disabled={busy === it.id}
                  style={{
                    ...btn(it.is_listed ? 'danger' : 'secondary'),
                    padding: '8px 14px',
                    fontSize: 13,
                    opacity: busy === it.id ? 0.6 : 1,
                    cursor: busy === it.id ? 'default' : 'pointer',
                  }}
                >
                  {busy === it.id ? '…' : it.is_listed ? 'Delist' : 'Relist'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
