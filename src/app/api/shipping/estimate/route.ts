import { NextResponse } from 'next/server';
import { shippingConfigured, estimateShipping, rateShop, pickCheapest, type Addr } from '@/lib/shipping';
import { localShipEstimate } from '@/lib/shipping-estimate';

export const dynamic = 'force-dynamic';

// Representative US destination for a listing-time estimate (the real buyer address is used at
// fulfillment). Zip-to-zip is enough for a ballpark.
const DEST: Addr = { street1: '417 Montgomery St', city: 'San Francisco', state: 'CA', zip: '94104', country: 'US' };

// Local fallback estimate (used until a carrier is configured) — shared with the client UI.
function localEstimate(weightOz: number, service: string): number {
  return localShipEstimate(weightOz, service);
}

function maxDaysFor(service: string): number {
  return service === 'overnight' ? 1 : service === 'economy' ? 7 : 2;
}

export async function POST(req: Request) {
  try {
    const { weight_oz, length_in, width_in, height_in, from_zip, service = '2day', carrier = 'cheapest' } = await req.json();
    const w = Number(weight_oz);
    if (!w || w <= 0) return NextResponse.json({ error: 'Enter item weight' }, { status: 400 });

    // No carrier account configured yet → transparent local estimate.
    if (!shippingConfigured()) {
      return NextResponse.json({
        configured: false, source: 'estimate',
        amount: localEstimate(w, service),
        carrier: carrier === 'cheapest' ? 'USPS' : carrier,
        service, delivery_days: maxDaysFor(service),
      });
    }

    // Listing-time we only have the seller's ZIP, not a full origin. USPS quotes ZIP-to-ZIP, so it
    // anchors the estimate; UPS/FedEx need a complete origin address and quote at fulfillment (where the
    // real seller→buyer addresses are known). So this is a USPS-anchored ballpark, by design.
    const from: Addr = { street1: '-', city: '-', state: '-', zip: String(from_zip || '94104'), country: 'US' };
    const parcel = { weight_oz: w, length_in, width_in, height_in };

    // No carrier filter → the shared recommend-cheapest-within-2-days helper.
    if (!carrier || carrier === 'cheapest') {
      const pick = await estimateShipping(from, parcel, maxDaysFor(service));
      if (!pick) {
        return NextResponse.json({ configured: true, source: 'estimate', amount: localEstimate(w, service), service, note: 'No live rate for that selection' });
      }
      return NextResponse.json({
        configured: true, source: 'live',
        amount: pick.rate, carrier: pick.carrier, service: pick.service, delivery_days: pick.delivery_days,
      });
    }

    const res = await rateShop(from, DEST, parcel);
    if (!res) {
      return NextResponse.json({ configured: false, source: 'estimate', amount: localEstimate(w, service), service });
    }

    const rates = res.rates.filter(r => r.carrier.toLowerCase() === String(carrier).toLowerCase());
    const pick = pickCheapest(rates, maxDaysFor(service));
    if (!pick) {
      return NextResponse.json({ configured: true, source: 'estimate', amount: localEstimate(w, service), service, note: 'No live rate for that selection' });
    }
    return NextResponse.json({
      configured: true, source: 'live',
      amount: pick.rate, carrier: pick.carrier, service: pick.service, delivery_days: pick.delivery_days,
    });
  } catch (err) {
    console.error('[shipping/estimate]', err);
    return NextResponse.json({ error: 'Could not estimate shipping' }, { status: 500 });
  }
}
