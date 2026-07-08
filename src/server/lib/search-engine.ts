import { create, insertMultiple, search } from '@orama/orama';
import { createServiceClient } from '@/lib/supabase/service';
import { expandSearchTerms } from './synonyms';
import { embedText, cosineSim } from '@/lib/embeddings';

// In-app intuitive search (Orama) — free, no AI, nothing extra to run.
// Builds its index straight from the live listings on a short TTL, so new
// mints/lists/sales show up automatically with no sync wiring or backfill.

// Shares the curated-map + Datamuse expansion used by the SQL ilike fallback, so the primary
// engine gets the same "navy → dark blue" and "succulent → cactus"-style relatedness, not just a
// curated-only subset. Orama's typo tolerance + BM25 rank the widened term set.
async function expandQuery(query: string): Promise<string> {
  const q = query.trim().toLowerCase();
  if (!q) return '';
  const terms = await expandSearchTerms(q);
  return Array.from(new Set([q, ...terms])).join(' ');
}

type ItemRow = Record<string, any>;

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

export async function searchListings(p: SearchParams): Promise<ItemRow[]> {
  // A blank/whitespace-only query has no terms to rank against — Orama treats an empty `term` as
  // match-all, which would silently degrade "search for nothing" into "browse everything". Return
  // no hits instead so an explicit blank search reads as an empty result, not the full catalog.
  if (!p.query?.trim()) return [];

  const db = await getIndex();
  const term = await expandQuery(p.query);

  const res = await search(db, {
    term,
    properties: ['name', 'category', 'condition', 'description'],
    boost: { name: 2 },
    tolerance: 1,    // typo tolerance: "addidas" → adidas, "jaket" → jacket
    threshold: 1,    // OR across tokens so synonyms widen recall; BM25 keeps best on top
    limit: 500,
  });

  const hits = res.hits.map((h: any) => h.document as ItemRow);
  return applyFiltersAndSort(hits, p);
}

// Semantic engine: rank listed items by cosine similarity between the query embedding and each item's
// stored embedding. Throws when embeddings are unavailable (no key, query embed failed, or nothing is
// embedded yet) so the caller falls back to the Orama BM25 engine — which itself falls back to SQL ilike.
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

  scored.sort((a, b) => b.s - a.s);
  return applyFiltersAndSort(scored.map((x) => x.r), p);
}
