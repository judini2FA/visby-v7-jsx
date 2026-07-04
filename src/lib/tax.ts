import Stripe from 'stripe';
import { captureError } from '@/lib/monitoring';

// Blueprint 4.9 — marketplace-facilitator sales tax via Stripe Tax. DARK by default behind
// STRIPE_TAX_ENABLED; when off, every function is a hard no-op returning zero tax, so the checkout money
// path is byte-identical to pre-4.9. Flip the flag ONLY once Judah has confirmed nexus + registered to
// collect in the relevant states (and set product tax codes) — collecting tax without registration is a
// liability, so this stays off until then.
//
// Fail-open to ZERO tax on any error: a tax-calculation outage must never block a sale. A missed tax
// line is a reconcilable revenue event; a blocked checkout is lost GMV.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Default product tax code — "general - tangible goods" (txcd_99999999). Physical luxury goods are
// tangible personal property; refine per-category later if needed.
const DEFAULT_TAX_CODE = process.env.STRIPE_TAX_PRODUCT_CODE ?? 'txcd_99999999';

export function taxEnabled(): boolean {
  return process.env.STRIPE_TAX_ENABLED === '1';
}

export type TaxAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal?: string | null;
  country?: string | null;
};

export type TaxResult = {
  tax_cents: number;            // additional tax the buyer pays on top of the item price
  calculation_id: string | null; // Stripe tax calculation id (persist to later record a transaction)
};

const ZERO: TaxResult = { tax_cents: 0, calculation_id: null };

// Compute sales tax for a single-item order. Returns ZERO when the flag is off, the address is
// incomplete, or Stripe errors — the caller then charges just the item price (pre-4.9 behavior).
export async function calculateOrderTax(args: {
  amountCents: number;
  address: TaxAddress;
  reference?: string;
}): Promise<TaxResult> {
  if (!taxEnabled()) return ZERO;
  const { amountCents, address, reference } = args;
  if (!Number.isFinite(amountCents) || amountCents <= 0) return ZERO;
  // Stripe Tax needs at least a country + a postal/state to place the transaction. Bail to zero if the
  // buyer hasn't given a usable address yet.
  if (!address?.country || (!address.postal && !address.state)) return ZERO;

  try {
    const calc = await stripe.tax.calculations.create({
      currency: 'usd',
      line_items: [
        {
          amount: Math.round(amountCents),
          reference: reference ?? 'item',
          tax_code: DEFAULT_TAX_CODE,
        },
      ],
      customer_details: {
        address: {
          line1: address.line1 ?? undefined,
          line2: address.line2 ?? undefined,
          city: address.city ?? undefined,
          state: address.state ?? undefined,
          postal_code: address.postal ?? undefined,
          country: address.country,
        },
        address_source: 'shipping',
      },
    });
    return { tax_cents: calc.tax_amount_exclusive ?? 0, calculation_id: calc.id ?? null };
  } catch (err) {
    captureError(err, { stage: 'calculateOrderTax', amountCents });
    return ZERO; // fail-open — never block a sale on a tax-calc failure
  }
}
