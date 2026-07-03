import type { Addr, Parcel, ShipRate, BoughtLabel, Carrier } from './types';

// AtoShip multi-carrier provider (https://atoship.com/docs). One /rates call shops USPS + UPS + FedEx
// (+ DHL) together; the chosen rate's id buys the label. Test keys (ak_test_) hit the same host and
// create no real labels. Prepaid wallet model: a 402 on purchase means the AtoShip balance needs topping
// up, not a code bug.

const BASE = process.env.ATOSHIP_BASE_URL ?? 'https://atoship.com/api/v1';

export function atoshipConfigured(): boolean {
  return !!process.env.ATOSHIP_API_KEY;
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const key = process.env.ATOSHIP_API_KEY;
  if (!key) throw new Error('AtoShip is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      // Error envelope: { object: "Error", error: { code, message } }
      const msg = data?.error?.message ?? data?.error ?? `AtoShip ${res.status}`;
      const err = new Error(typeof msg === 'string' ? msg : `AtoShip ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

function toAddress(a: Addr) {
  return {
    name: a.name ?? undefined,
    street1: a.street1,
    street2: a.street2 ?? undefined,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country ?? 'US',
    phone: a.phone ?? undefined,
  };
}

// Rates need all three dimensions; fall back to a small-box default for dimensionless listings.
function toParcel(p: Parcel) {
  return {
    weight: p.weight_oz,
    weight_unit: 'oz',
    length: p.length_in ?? 6,
    width: p.width_in ?? 4,
    height: p.height_in ?? 4,
    dimension_unit: 'in',
  };
}

// Responses use mixed carrier casing ("usps" | "USPS"); normalize onto our Carrier union.
function toCarrier(raw: unknown): Carrier | null {
  const c = String(raw ?? '').toLowerCase();
  if (c === 'usps') return 'USPS';
  if (c === 'ups') return 'UPS';
  if (c === 'fedex') return 'FedEx';
  if (c === 'dhl') return 'DHL';
  return null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export async function getRates(from: Addr, to: Addr, parcel: Parcel): Promise<ShipRate[]> {
  const data = await request<any>('POST', '/rates', {
    from_address: toAddress(from),
    to_address: toAddress(to),
    parcel: toParcel(parcel),
  });
  const raw: any[] = data?.rates ?? data?.data ?? (Array.isArray(data) ? data : []);
  const rates: ShipRate[] = [];
  for (const r of raw) {
    const carrier = toCarrier(r?.carrier);
    const price = Number(r?.rate ?? r?.cost);
    if (!carrier || !r?.id || !Number.isFinite(price) || price <= 0) continue;
    const service = String(r?.service ?? '').trim() || 'Standard';
    const days = Number(r?.delivery_days ?? r?.estimated_days);
    rates.push({
      id: String(r.id),
      carrier,
      service,
      service_code: String(r?.service_code ?? '').trim() || `${carrier.toLowerCase()}_${slug(service)}`,
      rate: price,
      delivery_days: Number.isFinite(days) && days > 0 ? days : null,
    });
  }
  return rates;
}

// Responses arrive flat or wrapped ({ data: {...} }) depending on endpoint — normalize.
const unwrap = (d: any) => (d && typeof d === 'object' && d.data && !Array.isArray(d.data) && typeof d.data === 'object' ? { ...d, ...d.data } : d);

export async function buyLabel(rate: ShipRate, from: Addr, to: Addr, parcel: Parcel): Promise<BoughtLabel | null> {
  let label = unwrap(await request<any>('POST', '/labels', {
    rate_id: rate.id,
    from_address: toAddress(from),
    to_address: toAddress(to),
    parcel: toParcel(parcel),
    label_format: 'pdf',
  }));

  // Test keys validate the request but never create a label ({ sandbox: true }) — surface that
  // honestly instead of a generic failure so a dev/test environment isn't confusing.
  if (label?.sandbox === true && !label?.tracking_number) {
    throw new Error('Shipping is in test mode — the label request validated, but real labels need the live AtoShip key (ak_live_).');
  }

  // Some flows return a draft first — finalize it to get tracking + the label file.
  if (label?.id && !label?.tracking_number) {
    label = unwrap(await request<any>('POST', `/labels/${label.id}/purchase`));
  }
  if (!label?.tracking_number) return null;

  const cost = Number(label?.rate ?? label?.cost);
  return {
    tracking_code: String(label.tracking_number),
    carrier: toCarrier(label?.carrier) ?? rate.carrier,
    service: String(label?.service ?? '').trim() || rate.service,
    rate: Number.isFinite(cost) && cost > 0 ? cost : rate.rate,
    label_url: label?.label_url ? String(label.label_url) : null,
    label_base64: null,
    label_format: 'PDF',
    label_id: label?.id ? String(label.id) : null,
  };
}

// Void an unused label (draft/purchased, ~30-day window) — refund credits back to the AtoShip wallet.
export async function voidLabel(labelId: string): Promise<boolean> {
  try {
    await request('DELETE', `/labels/${labelId}`);
    return true;
  } catch {
    return false;
  }
}
