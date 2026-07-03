export type Parcel = {
  weight_oz: number;
  length_in?: number;
  width_in?: number;
  height_in?: number;
};

export type Addr = {
  name?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string;
};

export type Carrier = 'UPS' | 'FedEx' | 'USPS' | 'DHL';

export type ShipRate = {
  id: string;
  carrier: Carrier;
  service: string;
  service_code: string;
  rate: number;
  delivery_days: number | null;
  recommended?: boolean;
};

export type BoughtLabel = {
  tracking_code: string;
  carrier: Carrier;
  service: string;
  rate: number;
  label_url: string | null;
  label_base64: string | null;
  label_format: 'PDF' | 'PNG' | 'GIF' | 'ZPL' | null;
  // Provider's label id (AtoShip lbl_...) — persisted so the label can be voided/refunded later.
  label_id?: string | null;
};

export interface CarrierAdapter {
  name: Carrier;
  isConfigured(): boolean;
  getRates(from: Addr, to: Addr, parcel: Parcel): Promise<ShipRate[]>;
  buyLabel(rate: ShipRate, from: Addr, to: Addr, parcel: Parcel): Promise<BoughtLabel | null>;
}

export const ozToLb = (oz: number) => Math.max(0.1, oz / 16);

export function rateId(carrier: Carrier, service_code: string): string {
  return carrier + ':' + service_code;
}
