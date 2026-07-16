import { describe, it, expect, vi, afterEach } from 'vitest';
import { captureError } from './monitoring';

// Regression test for the Sentry "[object Object]" issue (JAVASCRIPT-NEXTJS-1): captureError used
// `String(err)` for anything that wasn't `instanceof Error`, and Supabase's PostgrestError is a plain
// object — so every DB-error alert silently lost its real message.
describe('captureError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('extracts .message from a plain error-like object (Supabase PostgrestError)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pgError = { message: 'duplicate key value violates unique constraint', code: '23505', details: 'Key (id)=(1) already exists.' };
    captureError(pgError, { stage: 'test' });
    const [, loggedMessage] = spy.mock.calls[0];
    expect(loggedMessage).toBe(pgError.message);
    expect(loggedMessage).not.toBe('[object Object]');
  });

  it('still uses Error.message for real Error instances', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureError(new Error('boom'));
    expect(spy.mock.calls[0][1]).toBe('boom');
  });

  it('falls back to JSON.stringify for an object with no .message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureError({ code: 'weird', foo: 'bar' });
    expect(spy.mock.calls[0][1]).not.toBe('[object Object]');
    expect(spy.mock.calls[0][1]).toContain('weird');
  });

  it('handles a plain string or primitive without crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureError('a plain string error');
    expect(spy.mock.calls[0][1]).toBe('a plain string error');
  });
});
