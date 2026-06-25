// Visby platform economics — single source of truth for the take-rate.
//
// Tiered by sale channel:
//   • 'visby'   — a sale on Visby's own marketplace  → 9.0%
//   • 'partner' — a purchase routed through an embedded/partner API on another site → 3.5%
// The fee is DEDUCTED FROM THE SELLER (buyer pays the listed price). Shipping is also withheld from
// the seller's proceeds (paid to the carrier). The buyer always covers card processing implicitly in
// the price, and on crypto the buyer pays their own network fee (they sign the transfer).
//
// All money math is done in integer cents to avoid floating-point drift, then converted back to USD
// for storage. Change a rate here and every settlement path follows.

export const FEE_BPS = { visby: 900, partner: 350 } as const; // basis points: 100 bps = 1%
export type SaleChannel = keyof typeof FEE_BPS;

export function isSaleChannel(c: unknown): c is SaleChannel {
  return typeof c === 'string' && c in FEE_BPS;
}

// Defaults to the on-Visby rate for any unknown/absent channel (the safe, higher rate).
export function feeBpsForChannel(channel?: string | null): number {
  return isSaleChannel(channel) ? FEE_BPS[channel] : FEE_BPS.visby;
}

export function toCents(usd: number): number {
  return Math.round(usd * 100);
}
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function platformFeeCents(priceCents: number, channel?: string | null): number {
  return Math.round((priceCents * feeBpsForChannel(channel)) / 10000);
}

// Seller's net after the platform fee and shipping, never negative.
export function sellerNetCents(priceCents: number, shippingCents: number, channel?: string | null): number {
  return Math.max(0, priceCents - platformFeeCents(priceCents, channel) - shippingCents);
}

// Convenience: full breakdown in USD for a sale, given price + (optional) shipping in USD.
export function feeBreakdown(priceUsd: number, shippingUsd = 0, channel?: string | null) {
  const priceCents = toCents(priceUsd);
  const shipCents = toCents(shippingUsd);
  const feeCents = platformFeeCents(priceCents, channel);
  const netCents = sellerNetCents(priceCents, shipCents, channel);
  return {
    channel: isSaleChannel(channel) ? channel : ('visby' as SaleChannel),
    fee_bps: feeBpsForChannel(channel),
    platform_fee_usd: fromCents(feeCents),
    shipping_usd: fromCents(shipCents),
    seller_net_usd: fromCents(netCents),
    price_usd: fromCents(priceCents),
  };
}
