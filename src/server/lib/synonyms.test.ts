import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expandSearchTermsTiered } from '@/server/lib/synonyms';

// Deterministic stand-in for the Datamuse API (round-3 re-tune, S1 search precision). Routes each
// call to a canned word list by relation (rel_syn/rel_trg) + term so tests never hit the network.
function mockDatamuse(byTerm: Record<string, { syn?: string[]; trg?: string[] }>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url);
    const rel = u.searchParams.has('rel_syn') ? 'rel_syn' : u.searchParams.has('rel_trg') ? 'rel_trg' : null;
    const term = rel ? u.searchParams.get(rel)! : '';
    const words = rel === 'rel_syn' ? byTerm[term]?.syn ?? [] : rel === 'rel_trg' ? byTerm[term]?.trg ?? [] : [];
    return { ok: true, json: async () => words.map((word) => ({ word })) } as Response;
  }));
}

describe('synonyms — tiered expansion (S1 precision re-tune)', () => {
  beforeEach(() => {
    // Default: no Datamuse contribution unless a test opts in, so curated-only assertions stay
    // deterministic regardless of network/env.
    mockDatamuse({});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never echoes the literal query/tokens back into tier2 or tier3', async () => {
    const { tier2, tier3 } = await expandSearchTermsTiered('blue');
    expect(tier2).not.toContain('blue');
    expect(tier3).not.toContain('blue');
  });

  it('curated domain synonyms land in tier2 (strong), not tier3', async () => {
    // "watch" is a curated group: watch/timepiece/wristwatch.
    const { tier2 } = await expandSearchTermsTiered('watch');
    expect(tier2).toEqual(expect.arrayContaining(['timepiece', 'wristwatch']));
  });

  it('the succulent→cactus case: a loose Datamuse association lands in tier3, not tier2', async () => {
    mockDatamuse({ succulent: { syn: [], trg: ['cactus', 'plant'] } });
    const { tier2, tier3 } = await expandSearchTermsTiered('succulent');
    expect(tier3).toContain('cactus');
    expect(tier2).not.toContain('cactus');
  });

  it('tier3 is capped at 3 terms even when Datamuse returns more', async () => {
    mockDatamuse({ gadget: { syn: [], trg: ['device', 'gizmo', 'widget', 'contraption', 'tool'] } });
    const { tier3 } = await expandSearchTermsTiered('gadget');
    expect(tier3.length).toBeLessThanOrEqual(3);
  });

  it('a word promoted to tier2 (rel_syn) is never duplicated into tier3', async () => {
    mockDatamuse({ swift: { syn: ['fast'], trg: ['fast', 'bird'] } });
    const { tier2, tier3 } = await expandSearchTermsTiered('swift');
    expect(tier2).toContain('fast');
    expect(tier3).not.toContain('fast');
  });

  it('a blank query expands to nothing (no catalog dump downstream)', async () => {
    expect(await expandSearchTermsTiered('   ')).toEqual({ tier2: [], tier3: [] });
  });
});
