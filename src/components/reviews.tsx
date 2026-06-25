'use client';

import { useEffect, useState } from 'react';
import { t, S, card, surface, btn, sectionLabel, avatar, input } from '@/lib/ui';

// ─── Local helpers ────────────────────────────────────────────────────────────

function shortAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)    return 'just now';
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STAR_POINTS = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2';
const AMBER = 'var(--warn)';

// ─── StarRating ───────────────────────────────────────────────────────────────

interface StarRatingProps {
  value: number;
  max?: number;
  size?: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}

export function StarRating({ value, max = 5, size = 16, onChange, readOnly }: StarRatingProps) {
  const interactive = !!onChange && !readOnly;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i + 1 <= value;
        const star = (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={filled ? AMBER : 'none'}
            stroke={filled ? AMBER : 'var(--text-muted)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points={STAR_POINTS} />
          </svg>
        );

        if (interactive) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i + 1)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label={`Rate ${i + 1} star${i + 1 !== 1 ? 's' : ''}`}
            >
              {star}
            </button>
          );
        }

        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
            {star}
          </span>
        );
      })}
    </span>
  );
}

// ─── ReputationBadge ──────────────────────────────────────────────────────────

interface ReputationBadgeProps {
  avg: number;
  count: number;
}

export function ReputationBadge({ avg, count }: ReputationBadgeProps) {
  if (count === 0) {
    return (
      <span
        style={{
          ...surface({ radius: 'var(--pill)' }),
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
        }}
      >
        <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>New seller</span>
      </span>
    );
  }

  return (
    <span
      style={{
        ...surface({ radius: 'var(--pill)' }),
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
      }}
    >
      <svg
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill={AMBER}
        stroke={AMBER}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points={STAR_POINTS} />
      </svg>
      <span style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 700 }}>
        {avg.toFixed(1)}
      </span>
      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>
        ({count})
      </span>
    </span>
  );
}

// ─── ReviewList ───────────────────────────────────────────────────────────────

export interface ReviewItem {
  id: string;
  rating: number;
  comment?: string | null;
  reviewer_wallet: string;
  reviewer_name?: string | null;
  item_id?: string | null;
  item_name?: string | null;
  created_at: string;
}

interface ReviewListProps {
  reviews: ReviewItem[];
}

export function ReviewList({ reviews }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div style={{ ...t('body'), color: 'var(--text-muted)', textAlign: 'center', padding: `${S[5]}px 0` }}>
        No reviews yet
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {reviews.map((r, i) => {
        const displayName = r.reviewer_name || shortAddr(r.reviewer_wallet);
        const initials = displayName.slice(0, 2).toUpperCase();
        const isLast = i === reviews.length - 1;

        return (
          <div
            key={r.id}
            style={{
              display: 'flex',
              gap: S[3],
              padding: `${S[4]}px 0`,
              borderBottom: isLast ? 'none' : '1px solid var(--divider)',
            }}
          >
            {/* Avatar */}
            <div
              style={{
                ...avatar('sm'),
                background: 'var(--surface-bg)',
                color: 'var(--text-muted)',
                flexShrink: 0,
                border: '1px solid var(--glass-border)',
              }}
            >
              {initials}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>
                  {displayName}
                </span>
                <StarRating value={r.rating} size={13} readOnly />
                <span style={{ ...t('meta'), color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {timeAgo(r.created_at)}
                </span>
              </div>

              {/* Comment */}
              {r.comment && (
                <div style={{ ...t('body'), color: 'var(--text)' }}>
                  {r.comment}
                </div>
              )}

              {/* Item reference */}
              {r.item_name && (
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
                  on {r.item_name}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── OrderReviewSection ───────────────────────────────────────────────────────

interface OrderReviewSectionProps {
  orderId: string;
  reviewerWallet: string;
  getAccessToken: () => Promise<string | null>;
}

export function OrderReviewSection({
  orderId,
  reviewerWallet,
  getAccessToken,
}: OrderReviewSectionProps) {
  const [rating, setRating]     = useState(0);
  const [comment, setComment]   = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/reviews?order_id=${orderId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.review) {
          setRating(data.review.rating ?? 0);
          setComment(data.review.comment ?? '');
          setExisting(true);
        }
      } catch {
        // tolerate missing table or network errors
      }
    }
    load();
  }, [orderId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reviewer_wallet: reviewerWallet,
          order_id: orderId,
          rating,
          comment,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? 'Something went wrong. Please try again.');
      }
      setExisting(true);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', gap: S[4] }}>
      {/* Label */}
      <div style={sectionLabel()}>
        {existing ? 'Your review' : 'Rate your purchase'}
      </div>

      {/* Stars */}
      <StarRating value={rating} size={28} onChange={v => { setRating(v); if (done) setDone(false); }} />

      {/* Textarea */}
      <textarea
        value={comment}
        onChange={e => { setComment(e.target.value); if (done) setDone(false); }}
        placeholder="Share details about the item and seller (optional)"
        style={{
          ...input(),
          boxSizing: 'border-box',
          minHeight: 80,
          resize: 'vertical',
          fontFamily: "'Manrope', sans-serif",
        }}
      />

      {/* Error */}
      {error && (
        <div style={{ ...t('meta'), color: 'var(--danger)' }}>{error}</div>
      )}

      {/* Success */}
      {done && (
        <div style={{ ...t('meta'), color: 'var(--ok)' }}>Thanks for your review</div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={submit}
        disabled={rating === 0 || busy}
        style={{
          ...btn('primary', { full: true }),
          opacity: rating === 0 || busy ? 0.6 : 1,
          cursor: rating === 0 || busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ animation: 'spin .8s linear infinite' }}
            >
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            {existing ? 'Updating…' : 'Submitting…'}
          </>
        ) : existing ? 'Update review' : 'Submit review'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
