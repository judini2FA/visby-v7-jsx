import { create, insertMultiple, search } from '@orama/orama';
import { createServiceClient } from '@/lib/supabase/service';
import { GROUPS } from './synonyms';
import { embedText, cosineSim } from '@/lib/embeddings';

// In-app intuitive search (Orama) — free, no AI, nothing extra to run.
// Builds its index straight from the live listings on a short TTL, so new
// mints/lists/sales show up automatically with no sync wiring or backfill.

// Curated synonym lookup (offline, deterministic). Query expansion gives the
// "navy → dark blue" behavior; Orama's typo tolerance + BM25 do the rest.
const SYN = new Map<string, Set<string>>();
for (const group of GROUPS) {
  for (const term of group) {
    const key = term.toLowerCase();
    if (!SYN.has(key)) SYN.set(key, new Set());
    for (const other of group) if (other.toLowerCase() !== key) SYN.get(key)!.add(other.toLowerCase());
  }
}

function expandQuery(query: string): string {
  const q = query.trim().toLowerCase();
  if (!q) return '';
  const out = new Set<string>([q]);
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    out.add(t);
    for (const s of SYN.get(t) ?? []) out.add(s);
  }
  for (const s of SYN.get(q) ?? []) out.add(s); // whole-phrase keys like "dark blue"
  return Array.from(out).join(' ');
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
  const db = await getIndex();
  const term = expandQuery(p.query);

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
