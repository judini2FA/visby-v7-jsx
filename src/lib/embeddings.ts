// Provider-agnostic text embeddings for semantic search. Talks to any OpenAI-compatible /embeddings
// endpoint, so you can point it at the cheapest key you have — OpenAI `text-embedding-3-small` (pennies),
// or a free-tier provider that exposes an OpenAI-compatible route via EMBEDDINGS_BASE_URL. Fail-soft:
// returns null when unconfigured or on any error, so callers fall back to the keyword search engine.
//
// Env: EMBEDDINGS_API_KEY (required to enable), EMBEDDINGS_MODEL (default text-embedding-3-small),
// EMBEDDINGS_BASE_URL (default https://api.openai.com/v1).

const MODEL = process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small';
const BASE_URL = (process.env.EMBEDDINGS_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

export function semanticEnabled(): boolean {
  return !!process.env.EMBEDDINGS_API_KEY;
}

export function embeddingModel(): string {
  return MODEL;
}

export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.EMBEDDINGS_API_KEY;
  if (!key || !text?.trim()) return null;
  try {
    const res = await fetch(`${BASE_URL}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: text.slice(0, 8000) }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const vec = j?.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length ? (vec as number[]) : null;
  } catch {
    return null;
  }
}

// Cosine similarity in [-1, 1]. Length-tolerant so a stray dimension mismatch degrades gracefully
// rather than throwing.
export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
