import { Addr, Parcel, ShipRate, BoughtLabel, CarrierAdapter, ozToLb, rateId } from './types';

const CLIENT_ID = process.env.UPS_CLIENT_ID;
const CLIENT_SECRET = process.env.UPS_CLIENT_SECRET;
const ACCOUNT_NUMBER = process.env.UPS_ACCOUNT_NUMBER;

function isConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && ACCOUNT_NUMBER);
}

function baseUrl(): string {
  return process.env.SHIPPING_ENV === 'production'
    ? 'https://onlinetools.ups.com'
    : 'https://wwwcie.ups.com';
}

// UPS service code -> human label. 03=Ground is the workhorse; the Air tiers carry the
// guaranteed transit days the rate-shop ranks on.
const SERVICE_LABELS: Record<string, string> = {
  '03': 'UPS Ground',
  '02': 'UPS 2nd Day Air',
  '01': 'UPS Next Day Air',
  '12': 'UPS 3 Day Select',
  '13': 'UPS Next Day Air Saver',
  '59': 'UPS 2nd Day Air AM',
  '14': 'UPS Next Day Air Early',
};

// Fallback transit days when UPS omits GuaranteedDelivery (Ground is not guaranteed).
const FALLBACK_DAYS: Record<string, number> = {
  '01': 1,
  '13': 1,
  '14': 1,
  '02': 2,
  '59': 2,
  '12': 3,
  '03': 5,
};

const DEFAULT_DIMS = { length: 10, width: 8, height: 4 };

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// Cache the client-credentials token in module memory and refresh ~60s before it lapses, so a
// rate-shop that fans out to several calls doesn't re-auth on every request.
async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${baseUrl()}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`UPS OAuth failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number | string };
  const expiresIn = Number(json.expires_in) || 3600;
  cachedToken = json.access_token;
  tokenExpiresAt = now + (expiresIn - 60) * 1000;
  return cachedToken;
}

function upsAddress(a: Addr) {
  const lines = [a.street1, a.street2].filter(Boolean) as string[];
  return {
    AddressLine: lines,
    City: a.city,
    StateProvinceCode: a.state,
    PostalCode: a.zip,
    CountryCode: a.country ?? 'US',
  };
}

function packageBlock(parcel: Parcel) {
  return {
    PackagingType: { Code: '02' },
    Dimensions: {
      UnitOfMeasurement: { Code: 'IN' },
      Length: String(parcel.length_in ?? DEFAULT_DIMS.length),
      Width: String(parcel.width_in ?? DEFAULT_DIMS.width),
      Height: String(parcel.height_in ?? DEFAULT_DIMS.height),
    },
    PackageWeight: {
      UnitOfMeasurement: { Code: 'LBS' },
      Weight: ozToLb(parcel.weight_oz).toFixed(1),
    },
  };
}

async function getRates(from: Addr, to: Addr, parcel: Parcel): Promise<ShipRate[]> {
  if (!isConfigured()) return [];

  try {
    const token = await getToken();
    const reqBody = {
      RateRequest: {
        Shipment: {
          Shipper: {
            Name: from.name ?? 'Visby',
            ShipperNumber: ACCOUNT_NUMBER,
            Address: upsAddress(from),
          },
          ShipTo: { Address: upsAddress(to) },
          ShipFrom: { Address: upsAddress(from) },
          Package: [packageBlock(parcel)],
        },
      },
    };

    const res = await fetch(`${baseUrl()}/api/rating/v1/Shop`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`UPS getRates HTTP ${res.status}: ${body}`);
      return [];
    }

    const json = (await res.json()) as any;
    // VERIFY: RateResponse.RatedShipment is an array on /Shop; single-rate endpoints return an object.
    const rated: any[] = json?.RateResponse?.RatedShipment ?? [];
    const list = Array.isArray(rated) ? rated : [rated];

    const rates: ShipRate[] = [];
    for (const r of list) {
      // VERIFY: Service.Code is the UPS service code string.
      const code: string | undefined = r?.Service?.Code;
      if (!code) continue;
      // VERIFY: TotalCharges.MonetaryValue is a decimal string in USD.
      const valueStr: string | undefined = r?.TotalCharges?.MonetaryValue;
      const rate = parseFloat(valueStr ?? '');
      if (!isFinite(rate)) continue;

      // VERIFY: GuaranteedDelivery.BusinessDaysInTransit is a string count; absent for Ground.
      const transitStr: string | undefined = r?.GuaranteedDelivery?.BusinessDaysInTransit;
      const transit = transitStr != null ? parseInt(transitStr, 10) : NaN;
      const delivery_days = isFinite(transit) ? transit : FALLBACK_DAYS[code] ?? null;

      rates.push({
        id: rateId('UPS', code),
        carrier: 'UPS',
        service: SERVICE_LABELS[code] ?? `UPS ${code}`,
        service_code: code,
        rate,
        delivery_days,
      });
    }
    return rates;
  } catch (err) {
    console.error('UPS getRates error:', err);
    return [];
  }
}

async function buyLabel(
  rate: ShipRate,
  from: Addr,
  to: Addr,
  parcel: Parcel,
): Promise<BoughtLabel | null> {
  if (!isConfigured()) return null;

  const token = await getToken();
  const reqBody = {
    ShipmentRequest: {
      Shipment: {
        Shipper: {
          Name: from.name ?? 'Visby',
          ShipperNumber: ACCOUNT_NUMBER,
          Address: upsAddress(from),
        },
        ShipTo: {
          Name: to.name ?? 'Recipient',
          Address: upsAddress(to),
        },
        ShipFrom: {
          Name: from.name ?? 'Visby',
          Address: upsAddress(from),
        },
        Service: { Code: rate.service_code },
        Package: [packageBlock(parcel)],
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: { AccountNumber: ACCOUNT_NUMBER },
          },
        },
      },
      LabelSpecification: { LabelImageFormat: { Code: 'GIF' } },
    },
  };

  const res = await fetch(`${baseUrl()}/api/shipments/v1/ship`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reqBody),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`UPS buyLabel HTTP ${res.status}: ${body}`);
  }

  const json = (await res.json()) as any;
  // VERIFY: ShipmentResponse.ShipmentResults shape — tracking + base64 label location below.
  const results = json?.ShipmentResponse?.ShipmentResults;
  const tracking: string | undefined = results?.ShipmentIdentificationNumber;
  const pkg = Array.isArray(results?.PackageResults)
    ? results.PackageResults[0]
    : results?.PackageResults;
  // VERIFY: PackageResults[].ShippingLabel.GraphicImage is the base64 image (no data: prefix).
  const base64: string | undefined = pkg?.ShippingLabel?.GraphicImage;

  if (!tracking) {
    throw new Error('UPS buyLabel: no ShipmentIdentificationNumber in response');
  }

  return {
    tracking_code: tracking,
    carrier: 'UPS',
    service: rate.service,
    rate: rate.rate,
    label_url: null,
    label_base64: base64 ?? null,
    label_format: 'GIF',
  };
}

export const ups: CarrierAdapter = { name: 'UPS', isConfigured, getRates, buyLabel };
