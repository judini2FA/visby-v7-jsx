import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Fixed-window rate limiter. Prefers a durable, cross-instance count via the rate_limit_hit RPC
// (migration_rate_limits.sql); if that's absent/unavailable it degrades to a per-instance in-memory
// window — weaker in serverless (each lambda counts only its own traffic) but never errors. Always
// fail-OPEN on an unexpected backend error: a limiter outage must not take down the endpoints it guards.

export type RateResult = { allowed: boolean; remaining: number; retryAfterSec: number };

const mem = new Map<string, { windowStart: number; count: number }>();

function memoryLimit(key: string, limit: number, windowSec: number): RateResult {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));

  let cur = mem.get(key);
  if (!cur || cur.windowStart !== windowStart) {
    // Opportunistically evict stale keys so the map can't grow unbounded across windows.
    if (mem.size > 5000) for (const [k, v] of mem) if (v.windowStart !== windowStart) mem.delete(k);
    cur = { windowStart, count: 0 };
    mem.set(key, cur);
  }
  cur.count++;
  return { allowed: cur.count <= limit, remaining: Math.max(limit - cur.count, 0), retryAfterSec };
}

export async function rateLimit(key: string, opts: { limit: number; windowSec: number }): Promise<RateResult> {
  const { limit, windowSec } = opts;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_key: key, p_window_seconds: windowSec, p_limit: limit,
    });
    if (!error && Array.isArray(data) && data.length) {
      const row = data[0] as { allowed: boolean; remaining: number; reset_at: string };
      const retryAfterSec = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
      return { allowed: row.allowed, remaining: row.remaining, retryAfterSec };
    }
    // RPC missing (migration not run) or shape unexpected → in-memory fallback.
    return memoryLimit(key, limit, windowSec);
  } catch {
    return memoryLimit(key, limit, windowSec);
  }
}

// Best-effort client identity for keying. On Vercel x-forwarded-for is set; the left-most entry is the
// originating client. Spoofable in principle, but good enough to throttle casual abuse of public routes.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const first = xff.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

export function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests — slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}
