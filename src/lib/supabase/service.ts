import { createClient } from '@supabase/supabase-js';

// Service role client — bypasses RLS. Server-side only.
// fetch cache: 'no-store' prevents Next.js 14 from caching Supabase responses
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } }
  );
}
