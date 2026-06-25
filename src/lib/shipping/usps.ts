import { Addr, Parcel, ShipRate, BoughtLabel, CarrierAdapter, ozToLb, rateId } from './types';

// USPS has no separate sandbox host — same host, test creds switch behind the scenes.
const HOST = 'https://apis.usps.com';

const REQUIRED_ENV = ['USPS_CLIENT_ID', 'USPS_CLIENT_SECRET'] as const;

function isConfigured(): boolean {
  return REQUIRED_ENV.every((k) => {
    const v = process.env[k];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

// USPS mailClass must be queried one class at a time — there is no "shop all" call.
// Map each class to a human label + an approximate domestic transit estimate (USPS
// returns no firm commit on base-rates/search, so delivery_days is a published norm).
type UspsClass = {
  mailClass: string;
  service: string;
  service_code: string;
  delivery_days: number | null;
};

const USPS_CLASSES: UspsClass[] = [
  { mailClass: 'USPS_GROUND_ADVANTAGE', service: 'USPS Ground Advantage', service_code: 'USPS_GROUND_ADVANTAGE', delivery_days: 3 },
  { mailClass: 'PRIORITY_MAIL', service: 'USPS Priority Mail', service_code: 'PRIORITY_MAIL', delivery_days: 2 },
  { mailClass: 'PRIORITY_MAIL_EXPRESS', service: 'USPS Priority Mail Express', service_code: 'PRIORITY_MAIL_EXPRESS', delivery_days: 1 },
];

// Module-level token cache: USPS access_token is reusable until expiry; refetch only
// when missing or within ~60s of expiring to avoid an OAuth round-trip per rate call.
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  const res = await fetch(HOST + '/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.USPS_CLIENT_ID,
      client_secret: process.env.USPS_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('USPS OAuth failed: ' + res.status + ' ' + detail);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number }; // VERIFY token field names
  if (!json.access_token) {
    throw new Error('USPS OAuth returned no access_token');
  }

  const ttlMs = (json.expires_in ?? 3600) * 1000;
  tokenCache = { token: json.access_token, expiresAt: now + ttlMs };
  return json.access_token;
}

function defaultDims(parcel: Parcel) {
  return {
    length: parcel.length_in ?? 12,
    width: parcel.width_in ?? 9,
    height: parcel.height_in ?? 4,
  };
}

async function getRates(from: Addr, to: Addr, parcel: Parcel): Promise<ShipRate[]> {
  if (!isConfigured()) return [];

  try {
    const token = await getToken();
    const weightLb = ozToLb(parcel.weight_oz);
    const { length, width, height } = defaultDims(parcel);

    const settled = await Promise.all(
      USPS_CLASSES.map(async (cls): Promise<ShipRate | null> => {
        try {
          const res = await fetch(HOST + '/prices/v3/base-rates/search', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              originZIPCode: from.zip,
              destinationZIPCode: to.zip,
              weight: weightLb,
              length,
              width,
              height,
              mailClass: cls.mailClass,
              processingCategory: 'MACHINABLE',
              priceType: 'COMMERCIAL',
            }),
          });

          if (!res.ok) {
            // One class failing (e.g. not eligible for these dims) must not kill the rest.
            console.error('USPS base-rates ' + cls.mailClass + ' failed: ' + res.status);
            return null;
          }

          const json = (await res.json()) as { totalBasePrice?: number; rates?: Array<{ price?: number }> }; // VERIFY rate response shape
          const price =
            typeof json.totalBasePrice === 'number'
              ? json.totalBasePrice
              : json.rates?.[0]?.price; // VERIFY fallback path for price location
          if (typeof price !== 'number') return null;

          return {
            id: rateId('USPS', cls.service_code),
            carrier: 'USPS',
            service: cls.service,
            service_code: cls.service_code,
            rate: price,
            delivery_days: cls.delivery_days,
          };
        } catch (err) {
          console.error('USPS rate error (' + cls.mailClass + '):', err);
          return null;
        }
      }),
    );

    return settled.filter((r): r is ShipRate => r !== null);
  } catch (err) {
    console.error('USPS getRates error:', err);
    return [];
  }
}

async function buyLabel(rate: ShipRate, from: Addr, to: Addr, parcel: Parcel): Promise<BoughtLabel | null> {
  if (!isConfigured()) return null;

  const token = await getToken();
  const weightLb = ozToLb(parcel.weight_oz);
  const { length, width, height } = defaultDims(parcel);

  const res = await fetch(HOST + '/labels/v3/label', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageInfo: { imageType: 'PDF' }, // VERIFY label request body shape
      fromAddress: {
        firstName: from.name,
        streetAddress: from.street1,
        secondaryAddress: from.street2,
        city: from.city,
        state: from.state,
        ZIPCode: from.zip,
        phone: from.phone,
      },
      toAddress: {
        firstName: to.name,
        streetAddress: to.street1,
        secondaryAddress: to.street2,
        city: to.city,
        state: to.state,
        ZIPCode: to.zip,
        phone: to.phone,
      },
      packageDescription: {
        mailClass: rate.service_code,
        weight: weightLb,
        length,
        width,
        height,
        processingCategory: 'MACHINABLE',
        rateIndicator: 'SP',
        priceType: 'COMMERCIAL',
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // USPS labels require a funded payment account; surface that distinctly.
    if (res.status === 402 || res.status === 403) {
      throw new Error('USPS label requires payment account setup (' + res.status + '): ' + detail);
    }
    throw new Error('USPS label purchase failed: ' + res.status + ' ' + detail);
  }

  const json = (await res.json()) as {
    trackingNumber?: string;
    labelImage?: string;
    labelMetadata?: { trackingNumber?: string };
    labelAddress?: unknown;
  }; // VERIFY label response shape

  const tracking = json.trackingNumber ?? json.labelMetadata?.trackingNumber;
  const labelBase64 = json.labelImage ?? null; // VERIFY base64 field name/location

  if (!tracking) {
    throw new Error('USPS label purchase returned no tracking number');
  }

  return {
    tracking_code: tracking,
    carrier: 'USPS',
    service: rate.service,
    rate: rate.rate,
    label_url: null,
    label_base64: labelBase64,
    label_format: labelBase64 ? 'PDF' : null,
  };
}

export const usps: CarrierAdapter = { name: 'USPS', isConfigured, getRates, buyLabel };
