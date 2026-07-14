// Query expansion for intuitive search — no AI.
// 1. A curated domain map handles the high-value marketplace synonyms (colors,
//    materials, item-type slang) instantly and precisely.
// 2. Datamuse (free, keyless, not AI) fills in everything the map doesn't cover.
// Both degrade gracefully: if Datamuse is slow/down, curated + original term still work.
//
// Expansion is TIERED, not flat (round-3 re-tune — round 2's flat expandSearchTerms() fed every
// widened term into the ranker with equal standing, which over-broadened: "watch" could surface a
// handbag because a loosely-related word happened to appear in its description). Callers own tier1
// (the literal query) themselves; this module only produces:
//   tier2 "strong"  — curated domain synonyms + Datamuse rel_syn ("navy" → "dark blue").
//   tier3 "loose"   — Datamuse rel_trg co-occurring concepts ("succulent" → "cactus"), capped to
//                     3 terms so a starved search widens a little, not a lot.
// Callers (search-engine.ts, the listings router's SQL fallback) weight tier2/tier3 down and gate
// tier3 behind "tier1+2 came up thin" — see those files for the actual ranking logic.

const USE_DATAMUSE = (process.env.SEARCH_USE_DATAMUSE ?? 'true').toLowerCase() !== 'false';
const TIER3_CAP = 3;

// Each group expands to itself. Overlapping membership is fine (union of all groups
// containing a term), which avoids runaway transitive expansion.
export const GROUPS: string[][] = [
  // ── colors ──
  ['navy', 'navy blue', 'dark blue', 'midnight blue', 'midnight', 'blue'],
  ['blue', 'cobalt', 'azure', 'royal blue', 'sky blue'],
  ['burgundy', 'maroon', 'wine', 'oxblood', 'bordeaux', 'merlot'],
  ['red', 'crimson', 'scarlet', 'cherry'],
  ['tan', 'beige', 'khaki', 'camel', 'sand', 'taupe'],
  ['brown', 'chocolate', 'espresso', 'mocha', 'coffee'],
  ['grey', 'gray', 'charcoal', 'slate', 'graphite', 'gunmetal'],
  ['black', 'jet black', 'onyx', 'noir'],
  ['white', 'ivory', 'cream', 'off-white', 'off white', 'eggshell'],
  ['green', 'olive', 'emerald', 'forest green', 'sage', 'hunter green'],
  ['pink', 'rose', 'blush', 'salmon', 'fuchsia'],
  ['purple', 'violet', 'lavender', 'plum', 'aubergine'],
  ['orange', 'rust', 'terracotta', 'tangerine'],
  ['yellow', 'gold', 'mustard', 'amber'],
  ['silver', 'metallic', 'chrome'],
  // ── materials ──
  ['leather', 'suede', 'nubuck', 'calfskin'],
  ['denim', 'jean', 'jeans'],
  ['wool', 'cashmere', 'merino'],
  // ── item types / regional slang ──
  ['sneakers', 'trainers', 'kicks', 'shoes', 'runners'],
  ['bag', 'handbag', 'purse', 'tote', 'satchel'],
  ['watch', 'timepiece', 'wristwatch'],
  ['jumper', 'sweater', 'pullover', 'knit'],
  ['sunglasses', 'shades', 'sunnies', 'eyewear'],
  ['jacket', 'coat', 'outerwear'],
  ['sneaker', 'sneakers'],
];

const CURATED = new Map<string, Set<string>>();
for (const group of GROUPS) {
  for (const term of group) {
    const key = term.toLowerCase();
    if (!CURATED.has(key)) CURATED.set(key, new Set());
    for (const other of group) CURATED.get(key)!.add(other.toLowerCase());
  }
}

function curatedSynonyms(term: string): string[] {
  return Array.from(CURATED.get(term.toLowerCase()) ?? []);
}

async function datamuseWords(param: string, term: string, max: number): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const url = `https://api.datamuse.com/words?${param}=${encodeURIComponent(term)}&max=${max}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) return [];
    return (raw as any[])
      .map((r) => String(r?.word ?? '').trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// rel_syn = strict synonyms ("strong", tier2). rel_trg = loosely-related/co-occurring concepts
// ("loose", tier3, e.g. "succulent" → "cactus"). Kept separate (round 2 merged them, which is how a
// loose association ended up ranked the same as a real synonym).
function datamuseRelSyn(term: string): Promise<string[]> {
  return datamuseWords('rel_syn', term, 6);
}
function datamuseRelTrg(term: string): Promise<string[]> {
  return datamuseWords('rel_trg', term, 4);
}

export type TieredTerms = { tier2: string[]; tier3: string[] };

const tierCache = new Map<string, TieredTerms>();

// Returns the widened terms split by strength, EXCLUDING the caller's own literal query/tokens
// (that's tier1 and it's the caller's job to search it at full weight).
export async function expandSearchTermsTiered(query: string): Promise<TieredTerms> {
  const q = query.trim().toLowerCase();
  if (!q) return { tier2: [], tier3: [] };
  const cached = tierCache.get(q);
  if (cached) return cached;

  const tokens = q.split(/\s+/).filter(Boolean);
  const targets = Array.from(new Set([q, ...tokens]));
  const literal = new Set(targets); // owned by tier1 — never duplicated into tier2/3

  const tier2 = new Set<string>();
  for (const t of targets) for (const syn of curatedSynonyms(t)) if (!literal.has(syn)) tier2.add(syn);

  const tier3 = new Set<string>();
  if (USE_DATAMUSE) {
    const perTarget = await Promise.all(
      targets.slice(0, 3).map(async (t) => ({
        syn: await datamuseRelSyn(t),
        trg: await datamuseRelTrg(t),
      }))
    );
    for (const { syn } of perTarget) for (const w of syn) if (!literal.has(w)) tier2.add(w);
    // Only add to tier3 if not already promoted into tier2 by curated/rel_syn — keeps the tiers disjoint.
    for (const { trg } of perTarget) for (const w of trg) if (!literal.has(w) && !tier2.has(w)) tier3.add(w);
  }

  const out: TieredTerms = {
    tier2: Array.from(tier2).slice(0, 12),
    tier3: Array.from(tier3).slice(0, TIER3_CAP),
  };
  tierCache.set(q, out);
  return out;
}

// PostgREST .or() uses commas/parens as syntax — strip anything that could break it.
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
