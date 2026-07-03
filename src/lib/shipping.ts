import * as atoship from './shipping/atoship';
import type { Addr, Parcel, ShipRate, BoughtLabel, Carrier } from './shipping/types';

// Multi-carrier shipping via AtoShip (decision 2026-07-03 — replaced EasyPost after their signup
// failed; the direct UPS/FedEx/USPS adapters are retired). One rates call shops every carrier;
// recommendation is the cheapest service that lands within the 2-business-day window; the chosen
// rate's id buys the label. With no ATOSHIP_API_KEY the app falls back to manual tracking entry.
export type { Parcel, Addr, ShipRate, BoughtLabel, Carrier } from './shipping/types';
export { voidLabel } from './shipping/atoship';

const RECOMMEND_MAX_DAYS = 2;

export function shippingConfigured(): boolean {
  return atoship.atoshipConfigured();
}

export function configuredCarriers(): Carrier[] {
  return shippingConfigured() ? ['USPS', 'UPS', 'FedEx'] : [];
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
  if (!shippingConfigured()) return null;

  const rates = await atoship.getRates(from, to, parcel).catch(() => [] as ShipRate[]);
  rates.sort((a, b) => a.rate - b.rate);

  const rec = recommendRate(rates);
  if (rec) rec.recommended = true;

  return { rates };
}

export async function buyLabel(rate: ShipRate, from: Addr, to: Addr, parcel: Parcel): Promise<BoughtLabel | null> {
  if (!shippingConfigured()) return null;
  return atoship.buyLabel(rate, from, to, parcel);
}

// Representative US destination for a listing-time ballpark; the real buyer address is used at
// fulfillment.
const ESTIMATE_DEST: Addr = { street1: '417 Montgomery St', city: 'San Francisco', state: 'CA', zip: '94104', country: 'US' };

export async function estimateShipping(from: Addr, parcel: Parcel, _maxDays = RECOMMEND_MAX_DAYS): Promise<ShipRate | null> {
  const res = await rateShop(from, ESTIMATE_DEST, parcel);
  if (!res) return null;
  return recommendRate(res.rates);
}
