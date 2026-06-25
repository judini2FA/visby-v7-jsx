'use client';

import { useEffect, useRef, useState } from 'react';
import { t, S, surface, sectionLabel, input } from '@/lib/ui';
import { feeBreakdown } from '@/lib/fees';

export type ShipValues = {
  weight_oz: string; length_in: string; width_in: string; height_in: string;
  from_zip: string; service: string; carrier: string;
};
export const SHIP_DEFAULTS: ShipValues = {
  weight_oz: '', length_in: '', width_in: '', height_in: '',
  from_zip: '', service: '2day', carrier: 'cheapest',
};

const SERVICES = [
  { id: '2day',      label: 'Two-day' },
  { id: 'economy',   label: 'Economy' },
  { id: 'overnight', label: 'Overnight' },
];
const CARRIERS = [
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'USPS',     label: 'USPS' },
  { id: 'UPS',      label: 'UPS' },
  { id: 'FedEx',    label: 'FedEx' },
];

const GREEN = 'var(--ok)';

export default function ShippingEstimator({
  priceUsd, value, onChange,
}: {
  priceUsd?: number;
  value?: ShipValues;
  onChange?: (v: ShipValues) => void;
}) {
  const [v, setV] = useState<ShipValues>(value ?? SHIP_DEFAULTS);
  const [est, setEst] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function set<K extends keyof ShipValues>(k: K, val: string) {
    const next = { ...v, [k]: val };
    setV(next);
    onChange?.(next);
  }

  useEffect(() => {
    const w = parseFloat(v.weight_oz);
    if (!w || w <= 0) { setEst(null); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/shipping/estimate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weight_oz: w,
            length_in: parseFloat(v.length_in) || undefined,
            width_in:  parseFloat(v.width_in)  || undefined,
            height_in: parseFloat(v.height_in) || undefined,
            from_zip: v.from_zip, service: v.service, carrier: v.carrier,
          }),
        });
        const d = await res.json();
        setEst(res.ok ? d : null);
      } catch { setEst(null); } finally { setLoading(false); }
    }, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [v.weight_oz, v.length_in, v.width_in, v.height_in, v.from_zip, v.service, v.carrier]);

  const amount = est && typeof est.amount === 'number' ? est.amount : null;
  // Show the payout breakdown as soon as a price exists; shipping folds in once a weight is estimated.
  const bd = (typeof priceUsd === 'number' && priceUsd > 0) ? feeBreakdown(priceUsd, amount ?? 0) : null;

  const selectStyle = { ...input(), cursor: 'pointer' as const };

  return (
    <div style={{ ...surface({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div>
        <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Shipping</div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
          Calculated automatically and deducted from your sale price. Buyers pay the listed price.
        </div>
      </div>

      {/* weight + ship-from zip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
        <input value={v.weight_oz} onChange={e => set('weight_oz', e.target.value)} inputMode="decimal"
          placeholder="Weight (oz)" style={input()} />
        <input value={v.from_zip} onChange={e => set('from_zip', e.target.value)} inputMode="numeric"
          placeholder="From ZIP" style={input()} />
      </div>

      {/* dimensions (optional) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: S[2] }}>
        <input value={v.length_in} onChange={e => set('length_in', e.target.value)} inputMode="decimal" placeholder="L (in)" style={input()} />
        <input value={v.width_in}  onChange={e => set('width_in',  e.target.value)} inputMode="decimal" placeholder="W (in)" style={input()} />
        <input value={v.height_in} onChange={e => set('height_in', e.target.value)} inputMode="decimal" placeholder="H (in)" style={input()} />
      </div>

      {/* customization: speed + carrier */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
        <select value={v.service} onChange={e => set('service', e.target.value)} style={selectStyle}>
          {SERVICES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={v.carrier} onChange={e => set('carrier', e.target.value)} style={selectStyle}>
          {CARRIERS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      {/* payout readout — Visby fee + net appear as soon as a price is set; shipping folds in with weight */}
      <div style={{ ...surface({ pad: '12px 14px', radius: 'var(--r-sm)' }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
        {bd == null ? (
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Enter a price to see your payout.</div>
        ) : (
          <>
            {/* Shipping */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Estimated shipping</span>
              <span style={{ ...t('meta'), color: 'var(--text)' }}>
                {!parseFloat(v.weight_oz) ? 'add weight to estimate'
                  : loading ? 'estimating…'
                  : amount != null ? `−$${amount.toFixed(2)}`
                  : 'finalized at fulfillment'}
              </span>
            </div>
            {amount != null && est?.carrier && (
              <div style={{ ...t('micro'), color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
                {est.carrier}{est.delivery_days ? ` · ~${est.delivery_days}-day` : ''}{est.source === 'estimate' ? '  ·  approximate — live carrier rate at fulfillment' : '  ·  live rate'}
              </div>
            )}
            {/* Visby fee */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: S[1] }}>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Visby fee (9%)</span>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>−${bd.platform_fee_usd.toFixed(2)}</span>
            </div>
            {/* Net */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: S[1], paddingTop: S[2], borderTop: '1px solid var(--divider)' }}>
              <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>You'll net{amount != null ? ' (after fee + shipping)' : ' (after fee)'}</span>
              <span style={{ ...t('heading'), color: GREEN }}>~${bd.seller_net_usd.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
