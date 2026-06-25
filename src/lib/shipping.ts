import { ups } from './shipping/ups';
import { fedex } from './shipping/fedex';
import { usps } from './shipping/usps';
import type { Addr, Parcel, ShipRate, BoughtLabel, Carrier, CarrierAdapter } from './shipping/types';

// Direct-carrier rate-shop. Fans out to UPS / FedEx / USPS adapters, normalizes to one ShipRate
// list, recommends the cheapest service that lands within the 2-business-day window, and buys the
// chosen label. A carrier with missing creds is silently skipped — one carrier failing never
// breaks the others.
export type { Parcel, Addr, ShipRate, BoughtLabel, Carrier } from './shipping/types';

const ADAPTERS: CarrierAdapter[] = [ups, fedex, usps];

const RECOMMEND_MAX_DAYS = 2;

export function shippingConfigured(): boolean {
  return ADAPTERS.some(a => a.isConfigured());
}

export function configuredCarriers(): Carrier[] {
  return ADAPTERS.filter(a => a.isConfigured()).map(a => a.name);
}

function cheapest(rates: ShipRate[]): ShipRate | null {
  if (!rates.length) return null;
  return rates.reduce((best, r) => (r.rate < best.rate ? r : best));
}

// Cheapest service delivering within the 2-day window; falls back to the overall cheapest rate,
// then null. delivery_days == null (no firm commit) is never treated as in-window.
export function recommendRate(rates: ShipRate[]): ShipRate | null {
  const inWindow = rates.filter(r => r.delivery_days != null && r.delivery_days <= RECOMMEND_MAX_DAYS);
  return cheapest(inWindow) ?? cheapest(rates);
}

// Back-compat alias for the older helper name. Legacy callers passed a maxDays second arg; it is
// accepted and ignored — recommendRate fixes the window at 2 business days.
export const pickCheapest = (rates: ShipRate[], _maxDays?: number): ShipRate | null => recommendRate(rates);

export async function rateShop(from: Addr, to: Addr, parcel: Parcel): Promise<{ rates: ShipRate[] } | null> {
  const configured = ADAPTERS.filter(a => a.isConfigured());
  if (!configured.length) return null;

  const settled = await Promise.allSettled(configured.map(a => a.getRates(from, to, parcel)));
  const rates = settled.flatMap(s => (s.status === 'fulfilled' ? s.value : []));
  rates.sort((a, b) => a.rate - b.rate);

  const rec = recommendRate(rates);
  if (rec) rec.recommended = true;

  return { rates };
}

export async function buyLabel(rate: ShipRate, from: Addr, to: Addr, parcel: Parcel): Promise<BoughtLabel | null> {
  const adapter = ADAPTERS.find(a => a.name === rate.carrier);
  if (!adapter) return null;
  return adapter.buyLabel(rate, from, to, parcel);
}

// Representative US destination for a listing-time ballpark; the real buyer address is used at
// fulfillment.
const ESTIMATE_DEST: Addr = { street1: '417 Montgomery St', city: 'San Francisco', state: 'CA', zip: '94104', country: 'US' };

export async function estimateShipping(from: Addr, parcel: Parcel, _maxDays = RECOMMEND_MAX_DAYS): Promise<ShipRate | null> {
  const res = await rateShop(from, ESTIMATE_DEST, parcel);
  if (!res) return null;
  return recommendRate(res.rates);
}
