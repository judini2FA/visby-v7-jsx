import { create, insertMultiple, search } from '@orama/orama';
import { createServiceClient } from '@/lib/supabase/service';
import { GROUPS } from './synonyms';

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

let cached: { db: any; at: number } | null = null;
const TTL_MS = 10_000;

async function getIndex(): Promise<any> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.db;

  const supabase = createServiceClient();
  const { data } = await supabase.from('items').select('*').eq('is_listed', true);

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

  const docs = (data ?? []).map((r: ItemRow) => ({
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

  cached = { db, at: now };
  return db;
}

export function invalidateSearchIndex(): void {
  cached = null;
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

  let hits = res.hits.map((h: any) => h.document as ItemRow);

  // Structured filters (kept out of the text engine for exactness).
  if (p.category)  hits = hits.filter((d) => (d.category ?? '').toLowerCase() === p.category!.toLowerCase());
  if (p.condition) hits = hits.filter((d) => (d.condition ?? '').toLowerCase() === p.condition!.toLowerCase());
  if (p.minPrice != null) hits = hits.filter((d) => (d.price_usdc ?? 0) >= p.minPrice!);
  if (p.maxPrice != null) hits = hits.filter((d) => (d.price_usdc ?? 0) <= p.maxPrice!);

  if (p.sort === 'price_asc')  hits.sort((a, b) => (a.price_usdc ?? 0) - (b.price_usdc ?? 0));
  else if (p.sort === 'price_desc') hits.sort((a, b) => (b.price_usdc ?? 0) - (a.price_usdc ?? 0));
  else if (p.sort === 'popular') hits.sort((a, b) =>
    (b.view_count ?? 0) - (a.view_count ?? 0) ||
    String(b.listed_at ?? '').localeCompare(String(a.listed_at ?? ''))
  );
  // 'newest' / default with a query → keep Orama's relevance order.

  return hits.slice(0, p.limit ?? 40);
}
