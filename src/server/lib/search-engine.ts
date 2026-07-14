import { create, insertMultiple, search } from '@orama/orama';
import { createServiceClient } from '@/lib/supabase/service';
import { expandSearchTermsTiered } from './synonyms';
import { embedText, cosineSim } from '@/lib/embeddings';

// In-app intuitive search (Orama) — free, no AI, nothing extra to run.
// Builds its index straight from the live listings on a short TTL, so new
// mints/lists/sales show up automatically with no sync wiring or backfill.

// Ranking is TIERED (round-3 re-tune). Round 1 fixed "succulent doesn't find a cactus" by adding
// Datamuse synonym/association expansion. Round 2's expansion was flat — every widened term fed the
// same Orama query with equal standing — which over-broadened: a loosely-associated word could pull
// an unrelated item (e.g. a handbag) into a "watch" search. The fix keeps the recall win but ranks by
// tier, applied strongest-tier-wins (not summed), then cuts trailing junk with a score floor:
//   tier1 — the user's literal query, full weight (1.0). Always searched.
//   tier2 — curated + Datamuse rel_syn "strong" synonyms, weighted down (0.5).
//   tier3 — Datamuse rel_trg "loose" associations, weighted low (0.25) and ONLY searched when
//           tier1+tier2 together found fewer than MIN_RESULTS_BEFORE_TIER3 hits — so a well-served
//           query (like "watch") never gets association noise mixed in.
// After merging, anything scoring below MIN_SCORE_FRACTION of the top hit is dropped as trailing junk.
const TIER_WEIGHTS = { tier1: 1, tier2: 0.5, tier3: 0.25 } as const;
const MIN_RESULTS_BEFORE_TIER3 = 5;
const MIN_SCORE_FRACTION = 0.28; // drop hits scoring below 28% of the top hit's score

// Semantic path: a raw cosine top-K returns the "least bad" match even when nothing is actually
// relevant. Voyage/OpenAI short-text embeddings put genuinely related items roughly ~0.5-0.8+ and
// unrelated ones fall off below ~0.35-0.4, so floor here instead of trusting rank order alone.
// Tunable via env since the right floor is embedding-model-dependent.
const SEMANTIC_SCORE_FLOOR = Number(process.env.SEMANTIC_SCORE_FLOOR ?? 0.4);

type ItemRow = Record<string, any>;
type ScoredDoc = { doc: ItemRow; score: number };

const TTL_MS = 10_000;

// Shared source of truth for both engines: the live listed items, cached briefly so a burst of searches
// hits the DB once. New mints/lists/sales appear within the TTL with no sync wiring.
let cachedRows: { rows: ItemRow[]; at: number } | null = null;
async function getListedRows(): Promise<ItemRow[]> {
  const now = Date.now();
  if (cachedRows && now - cachedRows.at < TTL_MS) return cachedRows.rows;
  const supabase = createServiceClient();
  const { data } = await supabase.from('items').select('*').eq('is_listed', true);
  cachedRows = { rows: data ?? [], at: now };
  return cachedRows.rows;
}

let cachedDb: { db: any; at: number } | null = null;
async function getIndex(): Promise<any> {
  const now = Date.now();
  if (cachedDb && now - cachedDb.at < TTL_MS) return cachedDb.db;

  const rows = await getListedRows();
  const db = create({
    schema: {
      name: 'string',
      category: 'string',
      condition: 'string',
      description: 'string',
      price_usdc: 'number',
      view_count: 'number',
    },
  });

  const docs = rows.map((r: ItemRow) => ({
    ...r,
    id: String(r.id),
    name: r.name ?? '',
    category: r.category ?? '',
    condition: r.condition ?? '',
    description: r.description ?? '',
    price_usdc: r.price_usdc ?? 0,
    view_count: r.view_count ?? 0,
  }));
  if (docs.length) await insertMultiple(db, docs);

  cachedDb = { db, at: now };
  return db;
}

export function invalidateSearchIndex(): void {
  cachedRows = null;
  cachedDb = null;
}

// Shared structured filtering + sort, applied after either engine ranks by relevance.
function applyFiltersAndSort(hits: ItemRow[], p: SearchParams): ItemRow[] {
  let out = hits;
  if (p.category)  out = out.filter((d) => (d.category ?? '').toLowerCase() === p.category!.toLowerCase());
  if (p.condition) out = out.filter((d) => (d.condition ?? '').toLowerCase() === p.condition!.toLowerCase());
  if (p.minPrice != null) out = out.filter((d) => (d.price_usdc ?? 0) >= p.minPrice!);
  if (p.maxPrice != null) out = out.filter((d) => (d.price_usdc ?? 0) <= p.maxPrice!);

  if (p.sort === 'price_asc')  out = [...out].sort((a, b) => (a.price_usdc ?? 0) - (b.price_usdc ?? 0));
  else if (p.sort === 'price_desc') out = [...out].sort((a, b) => (b.price_usdc ?? 0) - (a.price_usdc ?? 0));
  else if (p.sort === 'popular') out = [...out].sort((a, b) =>
    (b.view_count ?? 0) - (a.view_count ?? 0) ||
    String(b.listed_at ?? '').localeCompare(String(a.listed_at ?? ''))
  );
  // 'newest' / default with a query → keep the engine's relevance order.
  return out.slice(0, p.limit ?? 40);
}

export type SearchParams = {
  query: string;
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular';
  limit?: number;
};

// Runs one Orama query and returns hits weighted for the tier they came from, keyed by item id.
async function runOramaTier(db: any, term: string, weight: number): Promise<Map<string, ScoredDoc>> {
  const out = new Map<string, ScoredDoc>();
  if (!term) return out;
  const res = await search(db, {
    term,
    properties: ['name', 'category', 'condition', 'description'],
    boost: { name: 2 },
    tolerance: 1,    // typo tolerance: "addidas" → adidas, "jaket" → jacket
    threshold: 1,    // OR across tokens within this tier's term set
    limit: 500,
  });
  for (const h of res.hits as any[]) {
    const doc = h.document as ItemRow;
    out.set(String(doc.id), { doc, score: (h.score as number) * weight });
  }
  return out;
}

// Merges tier hit-maps. A document's final score is the BEST-weighted tier it matched in, not the
// sum — so matching a weak tier3 association term never inflates a document past one that matched
// the literal query.
function mergeTiers(...maps: Map<string, ScoredDoc>[]): ScoredDoc[] {
  const merged = new Map<string, ScoredDoc>();
  for (const m of maps) {
    for (const [id, hit] of m) {
      const existing = merged.get(id);
      if (!existing || hit.score > existing.score) merged.set(id, hit);
    }
  }
  return Array.from(merged.values());
}

// Drops trailing junk: anything scoring below `fraction` of the top hit isn't a real match, it's
// noise that happened to touch a widened term. Exported for unit testing.
export function applyMinScoreThreshold(scored: ScoredDoc[], fraction = MIN_SCORE_FRACTION): ScoredDoc[] {
  if (!scored.length) return scored;
  const top = Math.max(...scored.map((s) => s.score));
  if (top <= 0) return scored;
  return scored.filter((s) => s.score >= top * fraction);
}

export async function searchListings(p: SearchParams): Promise<ItemRow[]> {
  // A blank/whitespace-only query has no terms to rank against — Orama treats an empty `term` as
  // match-all, which would silently degrade "search for nothing" into "browse everything". Return
  // no hits instead so an explicit blank search reads as an empty result, not the full catalog.
  if (!p.query?.trim()) return [];

  const db = await getIndex();
  const q = p.query.trim().toLowerCase();
  const { tier2, tier3 } = await expandSearchTermsTiered(q);

  const tier1Hits = await runOramaTier(db, q, TIER_WEIGHTS.tier1);
  const tier2Hits = tier2.length ? await runOramaTier(db, tier2.join(' '), TIER_WEIGHTS.tier2) : new Map<string, ScoredDoc>();

  let merged = mergeTiers(tier1Hits, tier2Hits);

  // Loose associations only fire when literal + strong-synonym tiers came up thin. This is what stops
  // "watch" from surfacing handbags: tier3 never runs unless the search is already starved for results.
  if (merged.length < MIN_RESULTS_BEFORE_TIER3 && tier3.length) {
    const tier3Hits = await runOramaTier(db, tier3.join(' '), TIER_WEIGHTS.tier3);
    merged = mergeTiers(tier1Hits, tier2Hits, tier3Hits);
  }

  const filtered = applyMinScoreThreshold(merged);
  filtered.sort((a, b) => b.score - a.score);

  const hits = filtered.map((s) => s.doc);
  return applyFiltersAndSort(hits, p);
}

// Semantic engine: rank listed items by cosine similarity between the query embedding and each item's
// stored embedding. Throws when embeddings are unavailable OR nothing clears the relevance floor (no
// key, query embed failed, nothing embedded yet, or every candidate is too dissimilar to trust) so the
// caller falls back to the Orama tiered engine — which can still find a literal keyword match semantic
// missed — rather than the caller silently accepting a distant "best of a bad bunch" result.
export async function semanticSearchListings(p: SearchParams): Promise<ItemRow[]> {
  if (!p.query?.trim()) return [];

  const qvec = await embedText(p.query);
  if (!qvec) throw new Error('query embedding unavailable');

  const rows = await getListedRows();
  const scored = rows
    // Same-dimension only: an item embedded by a previous model (different length) is skipped rather
    // than scored against the current query vector — the embed-items cron re-embeds it to the new model.
    .map((r) => (Array.isArray(r.embedding) && r.embedding.length === qvec.length
      ? { r, s: cosineSim(qvec, r.embedding as number[]) }
      : null))
    .filter((x): x is { r: ItemRow; s: number } => x !== null);
  if (!scored.length) throw new Error('no embedded items');

  const above = scored.filter((x) => x.s >= SEMANTIC_SCORE_FLOOR);
  if (!above.length) throw new Error('no results above semantic similarity floor');

  above.sort((a, b) => b.s - a.s);
  return applyFiltersAndSort(above.map((x) => x.r), p);
}
