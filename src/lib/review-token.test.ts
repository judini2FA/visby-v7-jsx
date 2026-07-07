import { describe, it, expect } from 'vitest';
import {
  reviewTokenConfigured,
  signReviewToken,
  verifyReviewToken,
} from '@/lib/review-token';

// Blueprint 11.4 — the stateless review-link token. REVIEW_TOKEN_SECRET is read at module load and is
// UNSET in the test process, so the whole path is in its documented fail-soft state: unconfigured →
// signing yields null and verification rejects everything. This is the security-critical default: with
// no secret configured, NO token — however well-formed-looking — must ever validate. (The happy-path
// sign/verify round-trip needs a real secret set before import; that's an env-dependent integration
// concern, documented rather than tested here to keep this deterministic and secret-free.)

describe('review-token — unconfigured (no REVIEW_TOKEN_SECRET) fails soft and closed', () => {
  it('reports itself as not configured', () => {
    expect(reviewTokenConfigured()).toBe(false);
  });

  it('signReviewToken returns null instead of minting an unsigned token', () => {
    expect(signReviewToken('order-1', 'wallet-1')).toBeNull();
    expect(signReviewToken('order-1', 'wallet-1', 60_000)).toBeNull();
  });

  it('verifyReviewToken rejects every input while unconfigured', () => {
    expect(verifyReviewToken(null)).toBeNull();
    expect(verifyReviewToken(undefined)).toBeNull();
    expect(verifyReviewToken('')).toBeNull();
    expect(verifyReviewToken('no-dot-here')).toBeNull();
    expect(verifyReviewToken('payload.signature')).toBeNull();
    // even a structurally plausible base64url.payload pair must not validate without the secret
    expect(verifyReviewToken('eyJvIjoieCJ9.deadbeef')).toBeNull();
  });
});
