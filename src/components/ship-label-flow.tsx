'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, surface, sheet, btn, badge, input } from '@/lib/ui';
import type { ShipRate } from '@/lib/shipping/types';

// Seller walkthrough for buying a shipping label on a sold order (blueprint SH1). Reuses the SAME
// backend the old inline SalesTab flow used — /api/seller/ship-from, /api/shipping/rates,
// /api/orders/ship — this file only owns the step UI. The parcel (weight/dims) is a per-LISTING
// property set at mint/edit time, not something this flow can override: the rate + label routes
// both derive it server-side from the item row, so Step 2 here is a confirm-and-link-to-edit step,
// never a value that's silently sent and ignored.

type OrderForShipping = {
  id: string;
  item_id: string;
  seller_wallet: string;
  price_usdc: number;
  ship_name: string | null;
  ship_address: { line1: string; line2?: string; city: string; state: string; postal: string; country: string } | null;
  items: { name: string; image_url: string | null };
};

type ShipFromAddr = {
  name: string; street1: string; street2: string;
  city: string; state: string; zip: string; country: string; phone: string;
};
const EMPTY_FROM: ShipFromAddr = { name: '', street1: '', street2: '', city: '', state: '', zip: '', country: 'US', phone: '' };

type ParcelInfo = { weight_oz: number | null; length_in: number | null; width_in: number | null; height_in: number | null };

type Step = 'from' | 'parcel' | 'rates' | 'buying' | 'done' | 'test_mode' | 'manual';

const RED = 'var(--danger)';
const GREEN = 'var(--ok)';

// Judah's rule (2026-07-18): only ever offer ~2-day-or-faster service — the seller picks the CARRIER
// (which company ships it), never the speed. Per carrier: keep the cheapest rate confirmed at
// <=2 delivery_days; if none is confirmed, fall back to the cheapest rate with NO firm day commit
// (e.g. a distance-priced Ground tier — typically the carrier's fastest/cheapest remaining option,
// never a rate explicitly quoted slower than 2 days). A carrier whose only quotes are confirmed
// slower than 2 days is dropped entirely rather than shown as a choice.
function twoDayRatesByCarrier(rates: ShipRate[]): ShipRate[] {
  const byCarrier = new Map<string, ShipRate[]>();
  for (const r of rates) {
    const list = byCarrier.get(r.carrier) ?? [];
    list.push(r);
    byCarrier.set(r.carrier, list);
  }
  const picked: ShipRate[] = [];
  for (const list of byCarrier.values()) {
    const confirmed = list.filter(r => r.delivery_days != null && r.delivery_days <= 2);
    const pool = confirmed.length ? confirmed : list.filter(r => r.delivery_days == null);
    if (!pool.length) continue;
    picked.push(pool.reduce((best, r) => (r.rate < best.rate ? r : best)));
  }
  return picked.sort((a, b) => a.rate - b.rate);
}

export function ShipLabelFlow({ order, onClose, onShipped }: {
  order: OrderForShipping;
  onClose: () => void;
  onShipped: (updated: { status: string; tracking_carrier?: string | null; tracking_number?: string | null; label_url?: string | null; shipping_cost?: number | null; shipping_service?: string | null }) => void;
}) {
  const { getAccessToken } = usePrivy();
  const [step, setStep] = useState<Step>('from');
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Step 1 — from address
  const [from, setFrom] = useState<ShipFromAddr>(EMPTY_FROM);
  const [fromErr, setFromErr] = useState('');
  const [savingFrom, setSavingFrom] = useState(false);

  // Step 2 — parcel (read-only confirm; the real value lives on the listing)
  const [parcel, setParcel] = useState<ParcelInfo>({ weight_oz: null, length_in: null, width_in: null, height_in: null });

  // Step 3 — rates
  const [rates, setRates] = useState<ShipRate[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesErr, setRatesErr] = useState('');
  const [ratesErrCode, setRatesErrCode] = useState('');

  // Step 4 — buy
  const [buyErr, setBuyErr] = useState('');
  const [bought, setBought] = useState<{ carrier?: string | null; tracking_number?: string | null; label_url?: string | null } | null>(null);

  // Manual fallback (parity with the old inline flow — same /api/orders/ship manual path)
  const [manualCarrier, setManualCarrier] = useState('');
  const [manualTracking, setManualTracking] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualErr, setManualErr] = useState('');

  const hasAddress = !!order.ship_address;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const [fromRes, itemRes] = await Promise.all([
          fetch(`/api/seller/ship-from?wallet=${encodeURIComponent(order.seller_wallet)}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
          fetch(`/api/item/${order.item_id}`).then(r => r.json()).catch(() => null),
        ]);
        if (cancelled) return;
        if (fromRes?.ship_from) setFrom(prev => ({ ...prev, ...fromRes.ship_from }));
        if (itemRes && !itemRes.error) {
          setParcel({
            weight_oz: itemRes.weight_oz != null ? Number(itemRes.weight_oz) : null,
            length_in: itemRes.length_in != null ? Number(itemRes.length_in) : null,
            width_in: itemRes.width_in != null ? Number(itemRes.width_in) : null,
            height_in: itemRes.height_in != null ? Number(itemRes.height_in) : null,
          });
        }
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.seller_wallet, order.item_id]);

  function setF<K extends keyof ShipFromAddr>(k: K, v: string) { setFrom(prev => ({ ...prev, [k]: v })); }

  async function saveFromAndContinue() {
    if (!from.street1.trim() || !from.city.trim() || !from.state.trim() || !from.zip.trim()) {
      setFromErr('Fill in street, city, state and ZIP.');
      return;
    }
    setSavingFrom(true);
    setFromErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/seller/ship-from', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ seller_wallet: order.seller_wallet, ship_from: from }),
      });
      const json = await res.json();
      if (!res.ok) { setFromErr(json.error ?? 'Could not save this address.'); return; }
      setStep('parcel');
    } catch {
      setFromErr('Network error — try again.');
    } finally {
      setSavingFrom(false);
    }
  }

  async function getRates() {
    setStep('rates');
    setRatesLoading(true);
    setRatesErr('');
    setRatesErrCode('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id, seller_wallet: order.seller_wallet }),
      });
      const json = await res.json();
      if (Array.isArray(json.rates) && json.rates.length) {
        const list = twoDayRatesByCarrier(json.rates as ShipRate[]);
        if (list.length) {
          setRates(list);
          const recommendedInList = json.recommended_id && list.some(r => r.id === json.recommended_id)
            ? json.recommended_id
            : list.find(r => r.recommended)?.id || list[0]?.id || '';
          setSelectedId(recommendedInList);
        } else {
          setRates(null);
          setRatesErr('No 2-day-or-faster carrier rate is available for this shipment yet — try again shortly or enter tracking manually.');
          setRatesErrCode('');
        }
      } else {
        setRates(null);
        setRatesErr(json.error ?? 'No carrier rates were returned for this shipment.');
        setRatesErrCode(json.code ?? '');
      }
    } catch {
      setRatesErr('Network error — try again.');
    } finally {
      setRatesLoading(false);
    }
  }

  async function buyChosenLabel() {
    const chosen = rates?.find(r => r.id === selectedId);
    if (!chosen) { setBuyErr('Select a shipping rate first.'); return; }
    setStep('buying');
    setBuyErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/orders/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id, seller_wallet: order.seller_wallet, auto_label: true, selected_carrier: chosen.carrier, selected_service: chosen.service_code }),
      });
      const json = await res.json();
      if (!json.ok) {
        const msg = String(json.error ?? '');
        if (/test mode/i.test(msg)) {
          setBuyErr(msg);
          setStep('test_mode');
        } else {
          setBuyErr(msg || 'Could not buy the label.');
          setStep('rates');
        }
        return;
      }
      setBought({ carrier: json.order?.tracking_carrier, tracking_number: json.order?.tracking_number, label_url: json.order?.label_url });
      setStep('done');
      onShipped({
        status: 'shipped',
        tracking_carrier: json.order?.tracking_carrier ?? null,
        tracking_number: json.order?.tracking_number ?? null,
        label_url: json.order?.label_url ?? null,
        shipping_cost: json.order?.shipping_cost ?? null,
        shipping_service: json.order?.shipping_service ?? null,
      });
    } catch {
      setBuyErr('Network error — try again.');
      setStep('rates');
    }
  }

  async function markShippedManual() {
    if (!manualCarrier.trim() || !manualTracking.trim()) { setManualErr('Enter carrier and tracking number.'); return; }
    setManualSaving(true);
    setManualErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/orders/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id, seller_wallet: order.seller_wallet, carrier: manualCarrier.trim(), tracking_number: manualTracking.trim() }),
      });
      const json = await res.json();
      if (!json.ok) { setManualErr(json.error ?? 'Could not mark shipped.'); return; }
      setBought({ carrier: json.order?.tracking_carrier, tracking_number: json.order?.tracking_number, label_url: null });
      setStep('done');
      onShipped({
        status: 'shipped',
        tracking_carrier: json.order?.tracking_carrier ?? null,
        tracking_number: json.order?.tracking_number ?? null,
      });
    } catch {
      setManualErr('Network error — try again.');
    } finally {
      setManualSaving(false);
    }
  }

  const STEP_ORDER: Step[] = ['from', 'parcel', 'rates'];
  const stepIndex = STEP_ORDER.includes(step) ? STEP_ORDER.indexOf(step) : (step === 'buying' ? 2 : -1);
  const cell = { ...input(), boxSizing: 'border-box' as const };
  const selectedRate = rates?.find(r => r.id === selectedId) ?? null;

  return typeof document === 'undefined' ? null : createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--modal-scrim)' }} />
      <div
        style={{
          ...sheet({ radius: '28px 28px 0 0' }),
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 560, zIndex: 301, borderBottom: 'none',
          padding: `${S[3]}px ${S[5]}px ${S[7]}px`, maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: S[4] }}>
          <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2 }} />
          <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', right: 0, top: -4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[4] }}>
          <div style={{ ...surface(), width: 44, height: 44, overflow: 'hidden', flexShrink: 0 }}>
            {order.items?.image_url
              ? <img src={order.items.image_url} alt={order.items.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: 'var(--surface-bg)' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Create shipping label</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.items?.name ?? '—'}</div>
          </div>
        </div>

        {/* Progress */}
        {stepIndex >= 0 && (
          <div style={{ display: 'flex', gap: S[1], marginBottom: S[5] }}>
            {['From', 'Parcel', 'Rate & buy'].map((label, i) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={{ height: 3, borderRadius: 2, background: i <= stepIndex ? 'var(--grad-brand)' : 'var(--divider)', marginBottom: 4 }} />
                <div style={{ ...t('micro'), color: i === stepIndex ? 'var(--text-strong)' : 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {loadingInitial ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {[1, 2].map(i => <div key={i} style={{ ...surface(), height: 48, animation: 'pulse 2s infinite' }} />)}
          </div>
        ) : !hasAddress ? (
          <div style={{ ...t('body'), color: 'var(--text-muted)', textAlign: 'center', padding: `${S[6]}px 0` }}>
            Waiting for the buyer to enter their shipping address before a label can be created.
          </div>
        ) : (
          <>
            {step === 'from' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Confirm the return address this label ships from.</div>
                <input value={from.name} onChange={e => setF('name', e.target.value)} placeholder="Name (optional)" style={cell} />
                <input value={from.street1} onChange={e => setF('street1', e.target.value)} placeholder="Street address" style={cell} />
                <input value={from.street2} onChange={e => setF('street2', e.target.value)} placeholder="Apt, suite (optional)" style={cell} />
                <div style={{ display: 'flex', gap: S[2] }}>
                  <input value={from.city} onChange={e => setF('city', e.target.value)} placeholder="City" style={{ ...cell, flex: 2 }} />
                  <input value={from.state} onChange={e => setF('state', e.target.value)} placeholder="State" style={{ ...cell, flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: S[2] }}>
                  <input value={from.zip} onChange={e => setF('zip', e.target.value)} inputMode="numeric" placeholder="ZIP" style={{ ...cell, flex: 1 }} />
                  <input value={from.country} onChange={e => setF('country', e.target.value)} placeholder="Country" style={{ ...cell, flex: 1 }} />
                </div>
                <input value={from.phone} onChange={e => setF('phone', e.target.value)} inputMode="tel" placeholder="Phone (optional)" style={cell} />
                {fromErr && <div style={{ ...t('meta'), color: RED }}>{fromErr}</div>}
                <div style={{ display: 'flex', gap: S[2], marginTop: S[2] }}>
                  <button onClick={onClose} style={{ ...btn('secondary'), flex: 1 }}>Cancel</button>
                  <button onClick={saveFromAndContinue} disabled={savingFrom} style={{ ...btn('primary'), flex: 2, opacity: savingFrom ? 0.6 : 1 }}>
                    {savingFrom ? 'Saving…' : 'Continue'}
                  </button>
                </div>
              </div>
            )}

            {step === 'parcel' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  Package size comes from the listing — carriers rate and label from this.
                </div>
                {!parcel.weight_oz ? (
                  <div style={{ ...surface({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
                    <div style={{ ...t('body'), color: RED }}>This item has no shipping weight set.</div>
                    <Link href={`/item/${order.item_id}`} style={{ ...t('meta'), color: 'var(--text-strong)' }}>Edit the listing to add it →</Link>
                  </div>
                ) : (
                  <div style={{ ...surface({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Weight</span>
                      <span style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>{parcel.weight_oz} oz</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Dimensions</span>
                      <span style={{ ...t('body'), color: 'var(--text-strong)' }}>
                        {parcel.length_in && parcel.width_in && parcel.height_in
                          ? `${parcel.length_in} × ${parcel.width_in} × ${parcel.height_in} in`
                          : 'Not set — carrier will use a default box'}
                      </span>
                    </div>
                    <Link href={`/item/${order.item_id}`} style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>Not right? Edit the listing →</Link>
                  </div>
                )}
                <div style={{ display: 'flex', gap: S[2], marginTop: S[2] }}>
                  <button onClick={() => setStep('from')} style={{ ...btn('secondary'), flex: 1 }}>Back</button>
                  <button onClick={getRates} disabled={!parcel.weight_oz} style={{ ...btn('primary'), flex: 2, opacity: parcel.weight_oz ? 1 : 0.5 }}>
                    Get shipping rates
                  </button>
                </div>
                <button onClick={() => setStep('manual')} style={{ ...btn('text'), alignSelf: 'center' }}>Enter tracking manually instead</button>
              </div>
            )}

            {(step === 'rates' || step === 'buying') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                {ratesLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                    {[1, 2, 3].map(i => <div key={i} style={{ ...surface(), height: 56, animation: 'pulse 2s infinite' }} />)}
                  </div>
                ) : ratesErr ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                    <div style={{ ...t('meta'), color: RED }}>{ratesErr}</div>
                    {ratesErrCode === 'no_ship_from' && <button onClick={() => setStep('from')} style={{ ...btn('secondary') }}>Fix from-address</button>}
                    <button onClick={getRates} style={{ ...btn('secondary') }}>Try again</button>
                  </div>
                ) : rates ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                      {rates.map(r => {
                        const sel = r.id === selectedId;
                        return (
                          <button
                            key={r.id}
                            onClick={() => setSelectedId(r.id)}
                            style={{
                              ...surface({ pad: S[3] }),
                              display: 'flex', alignItems: 'center', gap: S[3], width: '100%',
                              textAlign: 'left', cursor: 'pointer',
                              borderColor: sel ? '#2A8AED' : 'var(--glass-hairline)',
                              borderWidth: sel ? 2 : 1, borderStyle: 'solid',
                            }}
                          >
                            <div style={{
                              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: `1.5px solid ${sel ? '#2A8AED' : 'var(--glass-border)'}`,
                              background: sel ? '#2A8AED' : 'transparent',
                            }}>
                              {sel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>{r.carrier} {r.service}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginTop: 2 }}>
                                {r.delivery_days != null && <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>~{r.delivery_days}-day</span>}
                                {r.recommended && <span style={{ ...badge('success') }}>Recommended</span>}
                              </div>
                            </div>
                            <div style={{ ...t('heading'), color: 'var(--text-strong)', flexShrink: 0 }}>${Number(r.rate).toFixed(2)}</div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedRate && (
                      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                        ${Number(selectedRate.rate).toFixed(2)} label cost will be deducted from your payout.
                      </div>
                    )}
                    {buyErr && <div style={{ ...t('meta'), color: RED }}>{buyErr}</div>}
                    <div style={{ display: 'flex', gap: S[2] }}>
                      <button onClick={() => setStep('parcel')} disabled={step === 'buying'} style={{ ...btn('secondary'), flex: 1 }}>Back</button>
                      <button onClick={buyChosenLabel} disabled={step === 'buying' || !selectedRate} style={{ ...btn('primary'), flex: 2, opacity: (step === 'buying' || !selectedRate) ? 0.6 : 1 }}>
                        {step === 'buying' ? 'Buying label…' : 'Buy label & ship'}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {step === 'test_mode' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={{ ...surface({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Test mode</div>
                  <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
                    {buyErr || 'Shipping is in test mode — the label request validated against real carrier rates, but real labels need the live AtoShip key. No label was purchased and this order is still awaiting shipment.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: S[2] }}>
                  <button onClick={() => setStep('rates')} style={{ ...btn('secondary'), flex: 1 }}>Back to rates</button>
                  <button onClick={() => setStep('manual')} style={{ ...btn('primary'), flex: 1 }}>Enter tracking manually</button>
                </div>
              </div>
            )}

            {step === 'manual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>No money is spent — you're recording a label you already bought elsewhere.</div>
                <input value={manualCarrier} onChange={e => setManualCarrier(e.target.value)} placeholder="Carrier (e.g. UPS, FedEx)" style={cell} />
                <input value={manualTracking} onChange={e => setManualTracking(e.target.value)} placeholder="Tracking number" style={cell} />
                {manualErr && <div style={{ ...t('meta'), color: RED }}>{manualErr}</div>}
                <div style={{ display: 'flex', gap: S[2] }}>
                  <button onClick={() => setStep('parcel')} disabled={manualSaving} style={{ ...btn('secondary'), flex: 1 }}>Back</button>
                  <button onClick={markShippedManual} disabled={manualSaving} style={{ ...btn('primary'), flex: 2, opacity: manualSaving ? 0.6 : 1 }}>
                    {manualSaving ? 'Saving…' : 'Mark shipped'}
                  </button>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[3], alignItems: 'center', textAlign: 'center', padding: `${S[4]}px 0` }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Order marked shipped</div>
                {bought?.tracking_number && (
                  <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
                    {bought.carrier ? `${bought.carrier} · ` : ''}Tracking {bought.tracking_number}
                  </div>
                )}
                {bought?.label_url && (
                  <a href={bought.label_url} target="_blank" rel="noopener noreferrer" style={{ ...t('meta'), color: 'var(--text-strong)', textDecoration: 'underline' }}>
                    Print shipping label
                  </a>
                )}
                <button onClick={onClose} style={{ ...btn('primary', { full: true }), marginTop: S[2] }}>Done</button>
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </>,
    document.body,
  );
}
