// Client-safe local shipping estimate — a weight-based ballpark used wherever we want to show the
// seller their approximate shipping cost without a live carrier call. Mirrors the fallback used by
// /api/shipping/estimate. Weight in ounces; tier from the listing's ship_service_pref. Returns 0 when
// there's no usable weight (caller can then show "calculated at fulfillment").
export function localShipEstimate(weightOz: number | null | undefined, service?: string | null): number {
  const oz = Number(weightOz);
  if (!oz || oz <= 0) return 0;
  const w = Math.max(1, oz);
  const s = service || '2day';
  const amt =
    (s === 'economy' || s === 'cheapest') ? 6 + 0.20 * w :
    s === 'overnight'                     ? 25 + 0.80 * w :
                                            9 + 0.35 * w;   // 2day / cheapest_2day / default
  return Math.round(Math.min(80, amt) * 100) / 100;
}
