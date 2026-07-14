import { describe, it, expect } from 'vitest';
import { applyMinScoreThreshold } from '@/server/lib/search-engine';

// S1 (round 3): the tiered ranker weights tier1 (literal) > tier2 (strong synonym) > tier3 (loose
// association), then applies this threshold to cut trailing junk that only cleared a low bar because
// it matched a widened term. Covers the pure scoring step in isolation (no DB/Orama needed).
describe('search-engine — applyMinScoreThreshold (trailing-junk cutoff)', () => {
  it('drops hits scoring below ~28% of the top hit (default fraction)', () => {
    const scored = [
      { doc: { id: '1', name: 'Rolex Submariner' }, score: 10 },   // tier1 literal match
      { doc: { id: '2', name: 'Omega Seamaster' }, score: 4 },     // tier2 synonym, above floor (40%)
      { doc: { id: '3', name: 'Leather Tote' }, score: 1 },        // tier3 association, below floor (10%)
    ];
    const out = applyMinScoreThreshold(scored);
    expect(out.map((s) => s.doc.id)).toEqual(['1', '2']);
  });

  it('keeps everything when all hits are close to the top score', () => {
    const scored = [
      { doc: { id: '1' }, score: 10 },
      { doc: { id: '2' }, score: 9 },
      { doc: { id: '3' }, score: 8 },
    ];
    expect(applyMinScoreThreshold(scored)).toHaveLength(3);
  });

  it('respects a custom fraction', () => {
    const scored = [
      { doc: { id: '1' }, score: 10 },
      { doc: { id: '2' }, score: 6 },
    ];
    expect(applyMinScoreThreshold(scored, 0.7).map((s) => s.doc.id)).toEqual(['1']);
    expect(applyMinScoreThreshold(scored, 0.5).map((s) => s.doc.id)).toEqual(['1', '2']);
  });

  it('never throws on an empty result set', () => {
    expect(applyMinScoreThreshold([])).toEqual([]);
  });

  it('is a no-op safety net when the top score is zero or negative', () => {
    const scored = [{ doc: { id: '1' }, score: 0 }, { doc: { id: '2' }, score: 0 }];
    expect(applyMinScoreThreshold(scored)).toHaveLength(2);
  });
});
