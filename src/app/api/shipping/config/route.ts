import { NextResponse } from 'next/server';
import { shippingConfigured, configuredCarriers } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

// Lets the fulfillment UI know whether automatic carrier labels are available (at least one of
// UPS / FedEx / USPS has its creds set) so it can show the "buy label & ship" flow vs. the manual
// tracking-entry fallback, and which carriers can be rate-shopped.
// Intentionally public + unauthenticated: it returns only a feature flag plus carrier names, never
// any key or secret. The client (SalesTab) fetches it without a token — keep it open.
// `configured` is kept as a back-compat alias of `enabled` for older callers.
export async function GET() {
  const enabled = shippingConfigured();
  return NextResponse.json({ enabled, configured: enabled, carriers: configuredCarriers() });
}
