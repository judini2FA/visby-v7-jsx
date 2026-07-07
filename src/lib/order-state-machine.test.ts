import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUSES,
  LEGAL_TRANSITIONS,
  canTransition,
  assertTransition,
  type OrderStatus,
} from '@/lib/order-state-machine';

describe('order-state-machine — status domain', () => {
  it('ORDER_STATUSES matches the CHECK-constraint domain', () => {
    expect([...ORDER_STATUSES].sort()).toEqual(
      ['cancelled', 'delivered', 'paid', 'refunded', 'shipped'].sort()
    );
  });

  it('ORDER_STATUSES has no duplicates', () => {
    expect(new Set(ORDER_STATUSES).size).toBe(ORDER_STATUSES.length);
  });

  it('LEGAL_TRANSITIONS has an entry for every status', () => {
    for (const s of ORDER_STATUSES) {
      expect(LEGAL_TRANSITIONS[s]).toBeDefined();
      expect(Array.isArray(LEGAL_TRANSITIONS[s])).toBe(true);
    }
  });

  it('LEGAL_TRANSITIONS matches the canonical recon-derived graph exactly', () => {
    expect(LEGAL_TRANSITIONS).toEqual({
      paid: ['shipped', 'delivered', 'refunded'],
      shipped: ['paid', 'delivered', 'refunded'],
      delivered: ['refunded'],
      cancelled: [],
      refunded: [],
    });
  });
});

describe('order-state-machine — canTransition covers every legal edge in LEGAL_TRANSITIONS', () => {
  for (const from of ORDER_STATUSES) {
    for (const to of LEGAL_TRANSITIONS[from]) {
      it(`canTransition('${from}', '${to}') is true`, () => {
        expect(canTransition(from, to)).toBe(true);
      });
    }
  }
});

describe('order-state-machine — canTransition rejects illegal edges', () => {
  const illegalPairs: Array<[OrderStatus, OrderStatus]> = [
    ['delivered', 'paid'],
    ['delivered', 'shipped'],
    ['refunded', 'shipped'],
    ['refunded', 'paid'],
    ['refunded', 'delivered'],
    ['cancelled', 'paid'],
    ['cancelled', 'shipped'],
    ['cancelled', 'delivered'],
    ['cancelled', 'refunded'],
    ['paid', 'cancelled'],
    ['shipped', 'cancelled'],
    ['delivered', 'cancelled'],
    ['refunded', 'cancelled'],
  ];
  for (const [from, to] of illegalPairs) {
    it(`canTransition('${from}', '${to}') is false`, () => {
      expect(canTransition(from, to)).toBe(false);
    });
  }

  it('rejects every pair not explicitly present in LEGAL_TRANSITIONS (full cross-product check)', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const expected = LEGAL_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });
});

describe('order-state-machine — no self-transitions', () => {
  for (const s of ORDER_STATUSES) {
    it(`canTransition('${s}', '${s}') is false (no same-status no-op)`, () => {
      expect(canTransition(s, s)).toBe(false);
    });
  }
});

describe('order-state-machine — terminal states', () => {
  it("'cancelled' has zero outgoing transitions", () => {
    expect(LEGAL_TRANSITIONS.cancelled).toHaveLength(0);
    for (const to of ORDER_STATUSES) {
      expect(canTransition('cancelled', to)).toBe(false);
    }
  });

  it("'refunded' has zero outgoing transitions", () => {
    expect(LEGAL_TRANSITIONS.refunded).toHaveLength(0);
    for (const to of ORDER_STATUSES) {
      expect(canTransition('refunded', to)).toBe(false);
    }
  });
});

describe('order-state-machine — assertTransition', () => {
  it('does not throw for every legal transition', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of LEGAL_TRANSITIONS[from]) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });

  it('throws for an illegal transition', () => {
    expect(() => assertTransition('delivered', 'paid')).toThrow();
  });

  it('throws an Error with a message naming both statuses', () => {
    expect(() => assertTransition('refunded', 'shipped')).toThrow(
      /Illegal order status transition: 'refunded' -> 'shipped'/
    );
  });

  it('throws for every illegal transition across the full cross-product', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (LEGAL_TRANSITIONS[from].includes(to)) continue;
        expect(() => assertTransition(from, to)).toThrow(Error);
      }
    }
  });
});
