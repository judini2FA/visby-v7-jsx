'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { StarRating } from '@/components/reviews';
import { t, S, card, sectionLabel, btn, input } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

// In-app counterpart to the emailed review-token flow (src/app/review/[token]/page.tsx). Rendered
// on the order page for the buyer once an order is delivered — see reviews.ts createForOrder/getForOrder.
interface RateOrderProps {
  orderId: string;
}

export function RateOrder({ orderId }: RateOrderProps) {
  const utils = trpc.useUtils();
  const existingQ = trpc.reviews.getForOrder.useQuery({ orderId });
  const createMutation = trpc.reviews.createForOrder.useMutation({
    onSuccess: () => { utils.reviews.getForOrder.invalidate({ orderId }); },
  });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  if (existingQ.isLoading) {
    return (
      <div style={{ ...card(), padding: S[5], display: 'flex', alignItems: 'center', gap: S[3] }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--glass-border)', borderTopColor: 'var(--text-muted)', animation: 'spin .8s linear infinite', flexShrink: 0 }} />
        <span style={{ ...t('body'), color: 'var(--text-muted)' }}>Loading review…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const existing = existingQ.data;

  // Already rated — show the existing review instead of the form (covers both a review submitted
  // just now in this session and one submitted earlier via the emailed token link).
  if (existing) {
    return (
      <div style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={sectionLabel()}>Your review</div>
        <StarRating value={existing.rating} size={22} readOnly />
        {existing.comment && (
          <div style={{ ...t('body'), color: 'var(--text)' }}>{existing.comment}</div>
        )}
      </div>
    );
  }

  async function submit() {
    if (rating === 0 || createMutation.isPending) return;
    createMutation.mutate({ orderId, rating, comment: comment.trim() || undefined });
  }

  const conflict = createMutation.error?.data?.code === 'CONFLICT';

  return (
    <div style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div style={sectionLabel()}>Rate your purchase</div>

      <StarRating value={rating} size={28} onChange={setRating} />

      <textarea
        value={comment}
        onChange={e => setComment(e.target.value.slice(0, 2000))}
        placeholder="Share details about the item and seller (optional)"
        style={{ ...input(), boxSizing: 'border-box', minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
      />

      {createMutation.error && (
        <div style={{ ...t('meta'), color: 'var(--danger)' }}>
          {conflict ? 'You already reviewed this order.' : friendlyError(createMutation.error, 'Something went wrong. Please try again.')}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={rating === 0 || createMutation.isPending}
        style={{ ...btn('primary', { full: true }), opacity: rating === 0 || createMutation.isPending ? 0.6 : 1, cursor: rating === 0 || createMutation.isPending ? 'not-allowed' : 'pointer' }}
      >
        {createMutation.isPending ? (
          <>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} />
            Submitting…
          </>
        ) : 'Submit review'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
