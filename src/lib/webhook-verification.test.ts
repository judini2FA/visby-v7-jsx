import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import Stripe from 'stripe';

// Blueprint 11.2 — webhook signature-verification wrappers, exercised without any live infra.
//
// For each verifier we (a) mint our OWN test secret, (b) construct a validly-signed payload and assert
// it is ACCEPTED, (c) assert a tampered / missing signature is REJECTED (fail-closed), and (d) assert a
// wrong secret is rejected. Stripe-based verifiers sign via `stripe.webhooks.generateTestHeaderString`;
// HMAC verifiers are signed with node:crypto against the exact scheme the verifier documents.
//
// IMPORTANT — several verifiers capture their secret from process.env at MODULE-LOAD time (top-level
// `const`), so a plain `vi.stubEnv` after import can't redirect them. We instead set the env var and
// `vi.resetModules()` + dynamic-`import()` so the module re-evaluates against our test secret.

// A stripe instance only for the local generateTestHeaderString helper (no key is used for signing).
const stripeSign = new Stripe('sk_test_dummy_for_signing');

function stripeSignedHeader(payload: string, secret: string): string {
  return stripeSign.webhooks.generateTestHeaderString({ payload, secret });
}

describe('verifyMoovWebhook — HMAC-SHA512 over `timestamp|nonce|webhookID` headers', () => {
  const SECRET = 'moov_test_secret_' + 'x'.repeat(20);

  async function load(secret: string | undefined) {
    vi.resetModules();
    if (secret === undefined) delete process.env.MOOV_WEBHOOK_SECRET;
    else process.env.MOOV_WEBHOOK_SECRET = secret;
    return (await import('@/lib/moov')).verifyMoovWebhook;
  }

  function sign(secret: string, timestamp: string, nonce: string, webhookId: string): string {
    return crypto.createHmac('sha512', secret).update(`${timestamp}|${nonce}|${webhookId}`).digest('hex');
  }

  afterEach(() => {
    delete process.env.MOOV_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it('ACCEPTS a correctly-signed set of headers', async () => {
    const verify = await load(SECRET);
    const ts = '1720000000', nonce = 'n-abc', id = 'wh_1';
    expect(verify({ timestamp: ts, nonce, webhookId: id, signature: sign(SECRET, ts, nonce, id) })).toBe(true);
  });

  it('REJECTS a tampered signature', async () => {
    const verify = await load(SECRET);
    const ts = '1720000000', nonce = 'n-abc', id = 'wh_1';
    const good = sign(SECRET, ts, nonce, id);
    const tampered = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a');
    expect(verify({ timestamp: ts, nonce, webhookId: id, signature: tampered })).toBe(false);
  });

  it('REJECTS when the signed body differs from the presented headers (replay/tamper)', async () => {
    const verify = await load(SECRET);
    // Signature computed for one webhookId, presented with a different one.
    const sig = sign(SECRET, '1720000000', 'n-abc', 'wh_1');
    expect(verify({ timestamp: '1720000000', nonce: 'n-abc', webhookId: 'wh_2', signature: sig })).toBe(false);
  });

  it('REJECTS a missing signature (fail-closed)', async () => {
    const verify = await load(SECRET);
    expect(verify({ timestamp: '1720000000', nonce: 'n-abc', webhookId: 'wh_1', signature: null })).toBe(false);
  });

  it('REJECTS when any required header is missing (fail-closed)', async () => {
    const verify = await load(SECRET);
    const ts = '1720000000', nonce = 'n-abc', id = 'wh_1';
    const sig = sign(SECRET, ts, nonce, id);
    expect(verify({ timestamp: null, nonce, webhookId: id, signature: sig })).toBe(false);
    expect(verify({ timestamp: ts, nonce: null, webhookId: id, signature: sig })).toBe(false);
    expect(verify({ timestamp: ts, nonce, webhookId: null, signature: sig })).toBe(false);
  });

  it('REJECTS a signature made with the WRONG secret', async () => {
    const verify = await load(SECRET);
    const ts = '1720000000', nonce = 'n-abc', id = 'wh_1';
    const sig = sign('a-totally-different-secret', ts, nonce, id);
    expect(verify({ timestamp: ts, nonce, webhookId: id, signature: sig })).toBe(false);
  });

  it('fails CLOSED when no secret is configured at all', async () => {
    const verify = await load(undefined);
    // Even a signature that would be "valid" against an empty string must be rejected.
    const ts = '1720000000', nonce = 'n', id = 'w';
    const sig = crypto.createHmac('sha512', '').update(`${ts}|${nonce}|${id}`).digest('hex');
    expect(verify({ timestamp: ts, nonce, webhookId: id, signature: sig })).toBe(false);
  });
});

describe('verifyPersonaWebhook — HMAC-SHA256 of `${t}.${rawBody}`, header `t=..,v1=..`', () => {
  const SECRET = 'persona_test_secret_' + 'p'.repeat(20);
  const BODY = JSON.stringify({ data: { id: 'inq_1', type: 'inquiry' } });

  async function load(secret: string | undefined) {
    vi.resetModules();
    if (secret === undefined) delete process.env.PERSONA_WEBHOOK_SECRET;
    else process.env.PERSONA_WEBHOOK_SECRET = secret;
    return (await import('@/lib/persona')).verifyPersonaWebhook;
  }

  function header(secret: string, body: string, t = '1720000000'): string {
    const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    return `t=${t},v1=${v1}`;
  }

  afterEach(() => {
    delete process.env.PERSONA_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it('ACCEPTS a correctly-signed body', async () => {
    const verify = await load(SECRET);
    expect(verify(BODY, header(SECRET, BODY))).toBe(true);
  });

  it('ACCEPTS when the correct set is present among space-separated rotation sets', async () => {
    const verify = await load(SECRET);
    const good = header(SECRET, BODY);
    const stale = header('an-old-rotated-out-secret', BODY);
    // Persona sends multiple whitespace-separated sets during rotation; any matching one passes.
    expect(verify(BODY, `${stale} ${good}`)).toBe(true);
  });

  it('REJECTS a tampered body (signature no longer matches)', async () => {
    const verify = await load(SECRET);
    const h = header(SECRET, BODY);
    expect(verify(BODY + ' ', h)).toBe(false);
  });

  it('REJECTS a missing header (fail-closed)', async () => {
    const verify = await load(SECRET);
    expect(verify(BODY, null)).toBe(false);
  });

  it('REJECTS a malformed header with no v1', async () => {
    const verify = await load(SECRET);
    expect(verify(BODY, 't=1720000000')).toBe(false);
  });

  it('REJECTS a signature made with the WRONG secret', async () => {
    const verify = await load(SECRET);
    expect(verify(BODY, header('the-wrong-secret', BODY))).toBe(false);
  });

  it('fails CLOSED when no secret is configured', async () => {
    const verify = await load(undefined);
    expect(verify(BODY, header('', BODY))).toBe(false);
  });
});

describe('verifyIdentityWebhook — Stripe-signed (dedicated Identity endpoint secret)', () => {
  const SECRET = 'whsec_identity_' + 'i'.repeat(24);
  const PAYLOAD = JSON.stringify({
    id: 'evt_id_1',
    object: 'event',
    type: 'identity.verification_session.verified',
    data: { object: { id: 'vs_1', object: 'identity.verification_session', status: 'verified' } },
  });

  async function load(secret: string | undefined) {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'; // module constructs `new Stripe(...)` at load
    if (secret === undefined) delete process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
    else process.env.STRIPE_IDENTITY_WEBHOOK_SECRET = secret;
    return await import('@/lib/stripe-identity');
  }

  afterEach(() => {
    delete process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it('ACCEPTS a correctly-signed payload and returns the parsed event', async () => {
    const { verifyIdentityWebhook } = await load(SECRET);
    const header = stripeSignedHeader(PAYLOAD, SECRET);
    const result = verifyIdentityWebhook(PAYLOAD, header);
    expect(result).not.toBeNull();
    expect(result!.verified).toBe(true);
    expect(result!.event.type).toBe('identity.verification_session.verified');
  });

  it('REJECTS a tampered body (returns null)', async () => {
    const { verifyIdentityWebhook } = await load(SECRET);
    const header = stripeSignedHeader(PAYLOAD, SECRET);
    const tampered = PAYLOAD.replace('vs_1', 'vs_ATTACKER');
    expect(verifyIdentityWebhook(tampered, header)).toBeNull();
  });

  it('REJECTS a missing signature header (fail-closed)', async () => {
    const { verifyIdentityWebhook } = await load(SECRET);
    expect(verifyIdentityWebhook(PAYLOAD, null)).toBeNull();
  });

  it('REJECTS a signature made with the WRONG secret', async () => {
    const { verifyIdentityWebhook } = await load(SECRET);
    const header = stripeSignedHeader(PAYLOAD, 'whsec_a_different_secret_zzzz');
    expect(verifyIdentityWebhook(PAYLOAD, header)).toBeNull();
  });

  it('fails CLOSED when the Identity endpoint secret is unset', async () => {
    const { verifyIdentityWebhook, identityWebhookConfigured } = await load(undefined);
    expect(identityWebhookConfigured()).toBe(false);
    // A header validly signed against SOME secret is still rejected because none is configured.
    const header = stripeSignedHeader(PAYLOAD, SECRET);
    expect(verifyIdentityWebhook(PAYLOAD, header)).toBeNull();
  });
});

describe('Stripe payments webhook (POST /api/stripe/webhook) — constructEvent boundary', () => {
  const SECRET = 'whsec_payments_' + 'y'.repeat(24);

  // Sign against the payments-webhook secret and hit the real route handler. We assert the SIGNATURE
  // boundary only: a bad/missing signature is a 400 before any fulfillment; a well-signed but
  // metadata-less event is accepted past signature verification (then 400s on missing metadata), which
  // proves the signature check itself passed. Neither branch touches the DB.
  async function loadRoute(secret: string) {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    return (await import('@/app/api/stripe/webhook/route')).POST;
  }

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    vi.resetModules();
  });

  function req(body: string, sig: string | null): Request {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (sig !== null) headers['stripe-signature'] = sig;
    return new Request('https://visby.test/api/stripe/webhook', { method: 'POST', headers, body });
  }

  it('REJECTS (400) a missing stripe-signature header', async () => {
    const POST = await loadRoute(SECRET);
    const res = await POST(req('{}', null));
    expect(res.status).toBe(400);
  });

  it('REJECTS (400) a signature made with the WRONG secret', async () => {
    const POST = await loadRoute(SECRET);
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });
    const badHeader = stripeSignedHeader(payload, 'whsec_wrong_payments_secret_zz');
    const res = await POST(req(payload, badHeader));
    expect(res.status).toBe(400);
  });

  it('REJECTS (400) a tampered body under a valid-looking header', async () => {
    const POST = await loadRoute(SECRET);
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });
    const header = stripeSignedHeader(payload, SECRET);
    const res = await POST(req(payload + ' ', header)); // body no longer matches the signed digest
    expect(res.status).toBe(400);
  });

  it('PASSES signature verification for a correctly-signed event (proven by reaching the 400 missing-metadata branch, not the 400 signature branch)', async () => {
    const POST = await loadRoute(SECRET);
    // checkout.session.completed + payment_status:'paid' but no item_id/buyer_wallet metadata → the
    // handler gets PAST constructEvent and 400s specifically on missing metadata. If the signature had
    // failed we'd never reach that branch. Distinguish by the error message.
    const payload = JSON.stringify({
      id: 'evt_ok', object: 'event', type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', object: 'checkout.session', payment_status: 'paid', metadata: {} } },
    });
    const header = stripeSignedHeader(payload, SECRET);
    const res = await POST(req(payload, header));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing metadata'); // NOT a "Webhook signature failed" message
  });
});

describe('shipping webhook (POST /api/shipping/webhook) — HMAC + shared-secret verify wiring', () => {
  const SECRET = 'shipping_test_secret_' + 's'.repeat(20);
  // A recognized-but-irrelevant (non-delivered) event: passes verification then short-circuits with
  // { ok:true, ignored:true } BEFORE any DB access — so this exercises the real verify wiring with no infra.
  const BODY = JSON.stringify({ tracking_number: 'TRK123', status: 'in_transit' });

  async function loadRoute() {
    vi.resetModules();
    // verifyRequest reads SHIPPING_WEBHOOK_SECRET at CALL time, so set it before invoking POST.
    process.env.SHIPPING_WEBHOOK_SECRET = SECRET;
    delete process.env.SHIPPING_WEBHOOK_SIG_HEADER; // default header name x-atoship-signature
    return (await import('@/app/api/shipping/webhook/route')).POST;
  }

  afterEach(() => {
    delete process.env.SHIPPING_WEBHOOK_SECRET;
    vi.resetModules();
  });

  function hmacHex(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  function req(body: string, headers: Record<string, string>, urlSecret?: string): Request {
    const url = urlSecret
      ? `https://visby.test/api/shipping/webhook?secret=${encodeURIComponent(urlSecret)}`
      : 'https://visby.test/api/shipping/webhook';
    return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  }

  it('ACCEPTS a correct HMAC-SHA256 signature (hex)', async () => {
    const POST = await loadRoute();
    const res = await POST(req(BODY, { 'x-atoship-signature': hmacHex(BODY, SECRET) }));
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe(true);
  });

  it('ACCEPTS a `sha256=`-prefixed HMAC signature', async () => {
    const POST = await loadRoute();
    const res = await POST(req(BODY, { 'x-atoship-signature': 'sha256=' + hmacHex(BODY, SECRET) }));
    expect(res.status).toBe(200);
  });

  it('ACCEPTS a correct Bearer shared secret', async () => {
    const POST = await loadRoute();
    const res = await POST(req(BODY, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
  });

  it('ACCEPTS a correct ?secret= shared secret', async () => {
    const POST = await loadRoute();
    const res = await POST(req(BODY, {}, SECRET));
    expect(res.status).toBe(200);
  });

  it('REJECTS (401) a tampered HMAC signature', async () => {
    const POST = await loadRoute();
    const good = hmacHex(BODY, SECRET);
    const tampered = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a');
    const res = await POST(req(BODY, { 'x-atoship-signature': tampered }));
    expect(res.status).toBe(401);
  });

  it('REJECTS (401) a signature over a DIFFERENT body (tampered payload)', async () => {
    const POST = await loadRoute();
    const sigForOther = hmacHex(JSON.stringify({ tracking_number: 'OTHER' }), SECRET);
    const res = await POST(req(BODY, { 'x-atoship-signature': sigForOther }));
    expect(res.status).toBe(401);
  });

  it('REJECTS (401) a missing signature and missing shared secret (fail-closed)', async () => {
    const POST = await loadRoute();
    const res = await POST(req(BODY, {}));
    expect(res.status).toBe(401);
  });

  it('REJECTS (401) an HMAC signed with the WRONG secret', async () => {
    const POST = await loadRoute();
    const res = await POST(req(BODY, { 'x-atoship-signature': hmacHex(BODY, 'the-wrong-secret') }));
    expect(res.status).toBe(401);
  });

  it('REJECTS (401) a WRONG Bearer shared secret', async () => {
    const POST = await loadRoute();
    const res = await POST(req(BODY, { authorization: 'Bearer not-the-secret' }));
    expect(res.status).toBe(401);
  });

  it('fails CLOSED (401) when SHIPPING_WEBHOOK_SECRET is unset even with a valid-looking Bearer', async () => {
    vi.resetModules();
    delete process.env.SHIPPING_WEBHOOK_SECRET;
    const POST = (await import('@/app/api/shipping/webhook/route')).POST;
    const res = await POST(req(BODY, { authorization: 'Bearer anything' }));
    expect(res.status).toBe(401);
  });
});

describe('verifyReviewToken / signReviewToken — HMAC-SHA256 self-contained token', () => {
  const SECRET = 'review_token_secret_' + 'r'.repeat(20);

  async function load(secret: string | undefined) {
    vi.resetModules();
    if (secret === undefined) delete process.env.REVIEW_TOKEN_SECRET;
    else process.env.REVIEW_TOKEN_SECRET = secret;
    return await import('@/lib/review-token');
  }

  afterEach(() => {
    delete process.env.REVIEW_TOKEN_SECRET;
    vi.resetModules();
  });

  it('ACCEPTS a token it just signed and recovers the order + buyer', async () => {
    const { signReviewToken, verifyReviewToken } = await load(SECRET);
    const token = signReviewToken('ord_42', 'wallet_abc');
    expect(token).not.toBeNull();
    expect(verifyReviewToken(token)).toEqual({ order_id: 'ord_42', buyer_wallet: 'wallet_abc' });
  });

  it('REJECTS a token with a tampered signature', async () => {
    const { signReviewToken, verifyReviewToken } = await load(SECRET);
    const token = signReviewToken('ord_42', 'wallet_abc')!;
    const [payload, sig] = token.split('.');
    const tampered = `${payload}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`;
    expect(verifyReviewToken(tampered)).toBeNull();
  });

  it('REJECTS a token with a tampered payload (signature no longer matches)', async () => {
    const { signReviewToken, verifyReviewToken } = await load(SECRET);
    const token = signReviewToken('ord_42', 'wallet_abc')!;
    const sig = token.split('.')[1];
    const forgedPayload = Buffer.from(JSON.stringify({ o: 'ord_HACKED', b: 'attacker', e: Date.now() + 100000 })).toString('base64url');
    expect(verifyReviewToken(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it('REJECTS an expired token', async () => {
    const { signReviewToken, verifyReviewToken } = await load(SECRET);
    const expired = signReviewToken('ord_42', 'wallet_abc', -1000); // already past
    expect(verifyReviewToken(expired)).toBeNull();
  });

  it('REJECTS a token signed with a DIFFERENT secret', async () => {
    const { signReviewToken } = await load('secret-A-' + 'a'.repeat(16));
    const token = signReviewToken('ord_42', 'wallet_abc')!;
    // Re-load the module under a different secret and verify the old token fails.
    const { verifyReviewToken } = await load('secret-B-' + 'b'.repeat(16));
    expect(verifyReviewToken(token)).toBeNull();
  });

  it('REJECTS null / malformed input (fail-closed)', async () => {
    const { verifyReviewToken } = await load(SECRET);
    expect(verifyReviewToken(null)).toBeNull();
    expect(verifyReviewToken('')).toBeNull();
    expect(verifyReviewToken('no-dot-here')).toBeNull();
  });

  it('no-ops (fails closed) when the secret is unset / too short', async () => {
    const { reviewTokenConfigured, signReviewToken, verifyReviewToken } = await load(undefined);
    expect(reviewTokenConfigured()).toBe(false);
    expect(signReviewToken('ord_42', 'wallet_abc')).toBeNull();
    expect(verifyReviewToken('anything.anything')).toBeNull();
  });
});

describe('signWebhookPayload — outbound SDK/merchant webhook signing (Stripe-style)', () => {
  // Pure helper (secret is a parameter): sign a payload, then verify the emitted signature by
  // recomputing the HMAC independently and by feeding it back through Stripe's constructEvent, which
  // is exactly how a merchant SDK would validate it.
  it('emits `t=<ts>,v1=<hmac>` matching an independent HMAC-SHA256 of `${ts}.${payload}`', async () => {
    const { signWebhookPayload } = await import('@/lib/merchants');
    const secret = 'whsec_merchant_' + 'm'.repeat(24);
    const payload = JSON.stringify({ id: 'evt_x', type: 'order.completed' });
    const ts = 1720000000;
    const header = signWebhookPayload(payload, secret, ts);

    const m = header.match(/^t=(\d+),v1=([0-9a-f]+)$/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(ts);
    const expected = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
    expect(m![2]).toBe(expected);
  });

  it('the signature it emits is ACCEPTED by Stripe-compatible constructEvent (the merchant-side check)', async () => {
    const { signWebhookPayload } = await import('@/lib/merchants');
    const secret = 'whsec_merchant_' + 'n'.repeat(24);
    const payload = JSON.stringify({ id: 'evt_y', type: 'order.completed' });
    const ts = Math.floor(Date.now() / 1000);
    const header = signWebhookPayload(payload, secret, ts);
    // Stripe's verifier accepts exactly this scheme; a merchant using stripe-node validates this way.
    const ev = stripeSign.webhooks.constructEvent(payload, header, secret);
    expect((ev as unknown as { type: string }).type).toBe('order.completed');
  });

  it('a merchant using the WRONG secret REJECTS the signature', async () => {
    const { signWebhookPayload } = await import('@/lib/merchants');
    const secret = 'whsec_merchant_' + 'q'.repeat(24);
    const payload = JSON.stringify({ id: 'evt_z', type: 'order.completed' });
    const ts = Math.floor(Date.now() / 1000);
    const header = signWebhookPayload(payload, secret, ts);
    let threw = false;
    try {
      stripeSign.webhooks.constructEvent(payload, header, 'whsec_the_wrong_one_zzzzzzzzzz');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
