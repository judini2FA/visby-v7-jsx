// Formal state machine for `orders.status` (blueprint 4.7).
//
// SCOPE: this models ONLY the `orders` table (physical-fulfillment / marketplace orders).
// `sdk_orders` (VisbyPay SDK / merchant checkout) is a SEPARATE table with a disjoint status
// domain (`pending | paid | minted | failed | cancelled`) and its own write sites
// (src/lib/sdk-settle.ts). It is NOT modeled here — a machine for it would need its own
// LEGAL_TRANSITIONS table; do not conflate the two "orders" concepts.
//
// This file is ADDITIVE and OBSERVATIONAL ONLY: nothing in the live money/order routes calls
// into it yet (see the `TODO(4.7)` comments at each write site). It has zero imports so it can
// be loaded standalone (native Node type-stripping or a one-file esbuild compile) by
// scripts/test-order-state-machine.mjs without pulling in the app's Supabase/Next.js graph.
//
// Status domain source of truth: supabase/migration_orders.sql (base CHECK constraint) as
// widened by supabase/migration_disputes.sql:42-44 (`ALTER TABLE orders ... CHECK (status IN
// ('paid','shipped','delivered','cancelled','refunded'))`). There is no 'pending' status for
// this table — a row is only ever INSERTed at 'paid' (src/lib/orders.ts createOrder, the sole
// creation site); payment has already cleared by the time a row exists.

export type OrderStatus = 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

// The legal transition graph, built strictly from confirmed write sites (see recon table below;
// file:line references are current as of the 4.7 recon pass — re-grep if this drifts):
//
//   'paid' -> 'shipped'    src/app/api/orders/ship/route.ts:107  (auto-label CAS claim)
//   'paid' -> 'shipped'    src/app/api/orders/ship/route.ts:192  (manual-tracking CAS claim)
//   'shipped' -> 'paid'    src/app/api/orders/ship/route.ts:119  (rollback: buyLabel() threw)
//   'shipped' -> 'paid'    src/app/api/orders/ship/route.ts:124  (rollback: buyLabel() returned falsy)
//   'paid' -> 'delivered'      src/lib/order-finalize.ts:69  (finalizeDelivery, CAS .in(['paid','shipped']))
//   'shipped' -> 'delivered'   src/lib/order-finalize.ts:69  (same CAS, other starting leg)
//   'paid' -> 'refunded'       src/app/api/disputes/resolve/route.ts:179  (CAS .in(['paid','shipped','delivered']))
//   'shipped' -> 'refunded'    src/app/api/disputes/resolve/route.ts:179  (same CAS)
//   'delivered' -> 'refunded'  src/app/api/disputes/resolve/route.ts:179  (same CAS — payout-failed order,
//                               funds still in escrow; gated by payout_released=false at the DB level,
//                               which this pure graph does not model — see note below)
//
// 'cancelled' has NO known writer anywhere in the codebase (schema-legal, UI-recognized in
// filter dropdowns/type unions, but write-orphaned per the 4.7 recon). It is kept IN the status
// union (it's a real, reachable-by-direct-SQL value the validator must be able to classify) but
// has NO outgoing or incoming edges below — do not invent a transition into or out of it.
//
// 'refunded' and 'cancelled' are terminal: no code path transitions an order out of either.
//
// NOTE ON payout_released: the refund CAS above is additionally guarded in the live route by
// `.eq('payout_released', false)`, which this table intentionally does NOT encode — that's a
// side-column invariant (mutual exclusion between "refund the buyer" and "pay the seller"), not
// a `status` transition. A future richer validator could take payout_released as a second input;
// out of scope for 4.7 (status-only, per the recon).
//
// NO same-status no-op edges: every real write site above is a CAS keyed on the FROM status
// being different from the TO status (paid->shipped, shipped->delivered, etc.) — none of the
// recon'd call sites ever re-write a row to the status it already has. Idempotency in this
// codebase is achieved by the CAS predicate REJECTING the redundant write (0 rows matched), not
// by treating status -> same status as a legal transition. So self-transitions are disallowed.
export const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  paid: ['shipped', 'delivered', 'refunded'],
  shipped: ['paid', 'delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order status transition: '${from}' -> '${to}'`);
  }
}
