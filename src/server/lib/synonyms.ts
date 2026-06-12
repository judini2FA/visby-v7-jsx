// Query expansion for intuitive search — no AI.
// 1. A curated domain map handles the high-value marketplace synonyms (colors,
//    materials, item-type slang) instantly and precisely.
// 2. Datamuse (free, keyless, not AI) fills in everything the map doesn't cover.
// Both degrade gracefully: if Datamuse is slow/down, curated + original term still work.

const USE_DATAMUSE = (process.env.SEARCH_USE_DATAMUSE ?? 'true').toLowerCase() !== 'false';

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

async function datamuseSynonyms(term: string): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(term)}&max=6`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) return [];
    return (raw as any[])
      .map((r) => String(r?.word ?? '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 4);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, string[]>();

// Returns the original query plus expanded synonym terms (deduped, capped).
export async function expandSearchTerms(query: string): Promise<string[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const cached = cache.get(q);
  if (cached) return cached;

  const terms = new Set<string>([q]);
  const tokens = q.split(/\s+/).filter(Boolean);
  const targets = Array.from(new Set([q, ...tokens]));

  for (const t of targets) for (const syn of curatedSynonyms(t)) terms.add(syn);

  if (USE_DATAMUSE) {
    const lists = await Promise.all(targets.slice(0, 3).map(datamuseSynonyms));
    for (const list of lists) for (const w of list) terms.add(w);
  }

  const out = Array.from(terms).slice(0, 12);
  cache.set(q, out);
  return out;
}

// PostgREST .or() uses commas/parens as syntax — strip anything that could break it.
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
