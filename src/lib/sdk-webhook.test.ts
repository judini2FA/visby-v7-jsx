import { describe, it, expect } from 'vitest';
import {
  buildSdkWebhookEvent,
  scheduleAfterFailure,
  WEBHOOK_BACKOFF_MS,
  MAX_WEBHOOK_REDELIVERIES,
} from '@/lib/sdk-webhook';

// Blueprint 11.2 — pure (no DB/network) settle-side helpers for SDK webhook delivery.

describe('buildSdkWebhookEvent — event shape + stable dedupe id', () => {
  const base = {
    order_id: 'ord_1',
    nft_address: 'nft_abc',
    serial_number: '7',
    product_name: 'Air Jordan 1',
    amount_usd: 250,
  };

  it('a paid-but-not-yet-minted event is `order.payment_succeeded`', () => {
    const ev = buildSdkWebhookEvent({ ...base, minted: false, nft_address: null, serial_number: null });
    expect(ev.type).toBe('order.payment_succeeded');
    expect(ev.id).toBe('evt_ord_1_payment_succeeded');
    expect(ev.minted).toBe(false);
    expect(ev.payment_confirmed).toBe(true);
  });

  it('a minted event is `order.completed`', () => {
    const ev = buildSdkWebhookEvent({ ...base, minted: true });
    expect(ev.type).toBe('order.completed');
    expect(ev.id).toBe('evt_ord_1_completed');
    expect(ev.minted).toBe(true);
    expect(ev.nft_address).toBe('nft_abc');
    expect(ev.serial_number).toBe('7');
  });

  it('the id is STABLE across re-delivery of the same event (merchant dedupe key)', () => {
    const a = buildSdkWebhookEvent({ ...base, minted: true });
    const b = buildSdkWebhookEvent({ ...base, minted: true });
    expect(a.id).toBe(b.id);
  });

  it('payment_succeeded and completed for the SAME order are DISTINCT ids (deduped independently)', () => {
    const paid = buildSdkWebhookEvent({ ...base, minted: false });
    const done = buildSdkWebhookEvent({ ...base, minted: true });
    expect(paid.id).not.toBe(done.id);
  });

  it('carries the order details through verbatim', () => {
    const ev = buildSdkWebhookEvent({ ...base, minted: true });
    expect(ev.order_id).toBe('ord_1');
    expect(ev.product_name).toBe('Air Jordan 1');
    expect(ev.amount_usd).toBe(250);
  });
});

describe('scheduleAfterFailure — bounded exponential backoff for re-delivery', () => {
  const NOW = 1_720_000_000_000;

  it('MAX_WEBHOOK_REDELIVERIES matches the backoff table length', () => {
    expect(MAX_WEBHOOK_REDELIVERIES).toBe(WEBHOOK_BACKOFF_MS.length);
  });

  it('schedules round 0 at +1m and is not exhausted', () => {
    const r = scheduleAfterFailure(0, NOW);
    expect(r.exhausted).toBe(false);
    expect(r.webhook_next_attempt_at).toBe(new Date(NOW + WEBHOOK_BACKOFF_MS[0]).toISOString());
  });

  it('each round pushes the next attempt out per the table', () => {
    for (let round = 0; round < WEBHOOK_BACKOFF_MS.length; round++) {
      const r = scheduleAfterFailure(round, NOW);
      expect(r.exhausted).toBe(false);
      expect(r.webhook_next_attempt_at).toBe(new Date(NOW + WEBHOOK_BACKOFF_MS[round]).toISOString());
    }
  });

  it('the backoff is monotonically increasing', () => {
    for (let i = 1; i < WEBHOOK_BACKOFF_MS.length; i++) {
      expect(WEBHOOK_BACKOFF_MS[i]).toBeGreaterThan(WEBHOOK_BACKOFF_MS[i - 1]);
    }
  });

  it('gives up (null schedule, exhausted) once the cap is reached', () => {
    const r = scheduleAfterFailure(WEBHOOK_BACKOFF_MS.length, NOW);
    expect(r.exhausted).toBe(true);
    expect(r.webhook_next_attempt_at).toBeNull();
  });

  it('stays exhausted for any round beyond the cap', () => {
    const r = scheduleAfterFailure(WEBHOOK_BACKOFF_MS.length + 5, NOW);
    expect(r.exhausted).toBe(true);
    expect(r.webhook_next_attempt_at).toBeNull();
  });

  it('the cumulative backoff stays under the ~24h re-delivery cap', () => {
    const totalMs = WEBHOOK_BACKOFF_MS.reduce((a, b) => a + b, 0);
    expect(totalMs).toBeLessThan(24 * 60 * 60_000);
  });
});
