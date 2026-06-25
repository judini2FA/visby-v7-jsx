import { Addr, Parcel, ShipRate, BoughtLabel, CarrierAdapter, ozToLb, rateId } from './types';

const baseUrl = () =>
  (process.env.SHIPPING_ENV || 'sandbox') === 'production'
    ? 'https://apis.fedex.com'
    : 'https://apis-sandbox.fedex.com';

const env = (k: string) => (process.env[k] || '').trim();

function isConfigured(): boolean {
  return Boolean(env('FEDEX_CLIENT_ID') && env('FEDEX_CLIENT_SECRET') && env('FEDEX_ACCOUNT_NUMBER'));
}

// FedEx serviceType -> human label. Codes not listed fall back to the raw serviceType.
const SERVICE_LABELS: Record<string, string> = {
  FEDEX_GROUND: 'FedEx Ground',
  GROUND_HOME_DELIVERY: 'FedEx Home Delivery',
  FEDEX_2_DAY: 'FedEx 2Day',
  FEDEX_2_DAY_AM: 'FedEx 2Day AM',
  FEDEX_EXPRESS_SAVER: 'FedEx Express Saver',
  STANDARD_OVERNIGHT: 'FedEx Standard Overnight',
  PRIORITY_OVERNIGHT: 'FedEx Priority Overnight',
  FIRST_OVERNIGHT: 'FedEx First Overnight',
};

// Module-level token cache, reused across calls until ~60s before expiry.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt) return cachedToken.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env('FEDEX_CLIENT_ID'),
    client_secret: env('FEDEX_CLIENT_SECRET'),
  });

  const res = await fetch(baseUrl() + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('FedEx OAuth failed: ' + res.status + ' ' + text);
  }

  const json: any = await res.json();
  const accessToken = json.access_token as string; // VERIFY: token field name
  const expiresIn = Number(json.expires_in) || 3600; // VERIFY: expires_in field name (seconds)
  if (!accessToken) throw new Error('FedEx OAuth: no access_token in response');

  cachedToken = { token: accessToken, expiresAt: now + (expiresIn - 60) * 1000 };
  return accessToken;
}

function fedexAddress(a: Addr) {
  return {
    address: {
      streetLines: [a.street1, a.street2].filter(Boolean),
      city: a.city,
      stateOrProvinceCode: a.state,
      postalCode: a.zip,
      countryCode: a.country || 'US',
    },
  };
}

function packageLineItem(parcel: Parcel) {
  return {
    weight: { units: 'LB', value: ozToLb(parcel.weight_oz) },
    dimensions: {
      length: Math.round(parcel.length_in ?? 10),
      width: Math.round(parcel.width_in ?? 8),
      height: Math.round(parcel.height_in ?? 4),
      units: 'IN',
    },
  };
}

// FedEx may return transit time as an enum (e.g. TWO_DAYS) or a numeric commit date.
const TRANSIT_WORDS: Record<string, number> = {
  ONE_DAY: 1,
  TWO_DAYS: 2,
  THREE_DAYS: 3,
  FOUR_DAYS: 4,
  FIVE_DAYS: 5,
  SIX_DAYS: 6,
  SEVEN_DAYS: 7,
  EIGHT_DAYS: 8,
  NINE_DAYS: 9,
  TEN_DAYS: 10,
};

function transitDaysFrom(detail: any): number | null {
  const commit = detail?.commit;
  const opTransit = detail?.operationalDetail?.transitTime; // VERIFY: operationalDetail.transitTime path
  const word =
    commit?.derivedTransitDetails?.transitTime || // VERIFY: commit.derivedTransitDetails.transitTime path
    commit?.transitTime ||
    opTransit;
  if (typeof word === 'string' && TRANSIT_WORDS[word] != null) return TRANSIT_WORDS[word];
  return null;
}

async function getRates(from: Addr, to: Addr, parcel: Parcel): Promise<ShipRate[]> {
  if (!isConfigured()) return [];

  try {
    const token = await getToken();

    const reqBody = {
      accountNumber: { value: env('FEDEX_ACCOUNT_NUMBER') },
      requestedShipment: {
        shipper: fedexAddress(from),
        recipient: fedexAddress(to),
        pickupType: 'USE_SCHEDULED_PICKUP',
        rateRequestType: ['ACCOUNT', 'LIST'],
        requestedPackageLineItems: [packageLineItem(parcel)],
      },
    };

    const res = await fetch(baseUrl() + '/rate/v1/rates/quotes', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('FedEx getRates failed:', res.status, text);
      return [];
    }

    const json: any = await res.json();
    const details: any[] = json?.output?.rateReplyDetails ?? []; // VERIFY: output.rateReplyDetails path

    const rates: ShipRate[] = [];
    for (const d of details) {
      const serviceType: string = d?.serviceType; // VERIFY: serviceType field
      if (!serviceType) continue;

      const shipmentDetails: any[] = d?.ratedShipmentDetails ?? []; // VERIFY: ratedShipmentDetails path
      // Prefer ACCOUNT (negotiated) rate when present, else first available.
      const account = shipmentDetails.find((s) => s?.rateType === 'ACCOUNT' || s?.rateType === 'PAYOR_ACCOUNT_PACKAGE');
      const chosen = account || shipmentDetails[0];
      const amount = Number(chosen?.totalNetCharge); // VERIFY: totalNetCharge is a plain number
      if (!Number.isFinite(amount)) continue;

      rates.push({
        id: rateId('FedEx', serviceType),
        carrier: 'FedEx',
        service: SERVICE_LABELS[serviceType] || serviceType,
        service_code: serviceType,
        rate: amount,
        delivery_days: transitDaysFrom(d),
      });
    }

    return rates;
  } catch (err) {
    console.error('FedEx getRates error:', err);
    return [];
  }
}

async function buyLabel(rate: ShipRate, from: Addr, to: Addr, parcel: Parcel): Promise<BoughtLabel | null> {
  if (!isConfigured()) return null;

  const token = await getToken();

  const reqBody = {
    labelResponseOptions: 'URL_ONLY',
    accountNumber: { value: env('FEDEX_ACCOUNT_NUMBER') },
    requestedShipment: {
      shipper: { ...fedexAddress(from), contact: { personName: from.name || 'Shipper', phoneNumber: from.phone || '0000000000' } },
      recipients: [{ ...fedexAddress(to), contact: { personName: to.name || 'Recipient', phoneNumber: to.phone || '0000000000' } }],
      pickupType: 'USE_SCHEDULED_PICKUP',
      serviceType: rate.service_code,
      packagingType: 'YOUR_PACKAGING',
      shippingChargesPayment: { paymentType: 'SENDER' },
      labelSpecification: { imageType: 'PDF', labelStockType: 'PAPER_4X6' },
      requestedPackageLineItems: [packageLineItem(parcel)],
    },
  };

  const res = await fetch(baseUrl() + '/ship/v1/shipments', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reqBody),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('FedEx buyLabel failed: ' + res.status + ' ' + text);
  }

  const json: any = await res.json();
  const shipment = json?.output?.transactionShipments?.[0]; // VERIFY: output.transactionShipments path
  const piece = shipment?.pieceResponses?.[0]; // VERIFY: pieceResponses path
  const doc = piece?.packageDocuments?.[0]; // VERIFY: packageDocuments path

  const tracking: string | undefined = piece?.trackingNumber; // VERIFY: trackingNumber field
  if (!tracking) throw new Error('FedEx buyLabel: no trackingNumber in response');

  const labelUrl: string | null = doc?.url ?? null; // VERIFY: packageDocuments[].url
  const labelBase64: string | null = doc?.encodedLabel ?? null; // VERIFY: packageDocuments[].encodedLabel

  return {
    tracking_code: tracking,
    carrier: 'FedEx',
    service: rate.service,
    rate: rate.rate,
    label_url: labelUrl,
    label_base64: labelBase64,
    label_format: labelUrl || labelBase64 ? 'PDF' : null,
  };
}

export const fedex: CarrierAdapter = { name: 'FedEx', isConfigured, getRates, buyLabel };
