export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';

// Listings moderation. Any admin role may read the catalog; the ONLY mutation is toggling an item's
// is_listed flag (delist/relist), a reversible action. Every query fail-softs so a missing table or
// unmigrated column returns empty rather than 500ing.
async function requireAdmin(req: Request, wallet: string | null | undefined): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet))) return false;
  return callerOwnsWallet(req, wallet);
}

const COLUMNS =
  'id, name, category, condition, price_usdc, is_listed, current_owner_wallet, serial_number, serial_status, brand, image_url, view_count, created_at, listed_at';
// Fallback set for pre-analytics / pre-brand-registry DBs where view_count/serial_status/brand may not exist yet.
const COLUMNS_MIN =
  'id, name, category, condition, price_usdc, is_listed, current_owner_wallet, serial_number, image_url, created_at, listed_at';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get('wallet');
  if (!(await requireAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const filter = url.searchParams.get('filter') === 'all' ? 'all' : 'listed';
  const q = (url.searchParams.get('q') ?? '').trim();

  const supabase = createServiceClient();

  const run = async (columns: string): Promise<any[] | null> => {
    let query = supabase.from('items').select(columns).order('created_at', { ascending: false }).limit(200);
    if (filter === 'listed') query = query.eq('is_listed', true);
    if (q) {
      const esc = q.replace(/[%,]/g, ' ');
      query = query.or(`name.ilike.%${esc}%,category.ilike.%${esc}%,brand.ilike.%${esc}%`);
    }
    const { data, error } = await query;
    if (error) return null;
    return data ?? [];
  };

  let items: any[] | null = null;
  try {
    items = await run(COLUMNS);
    if (items === null) {
      // Missing column (view_count/serial_status/brand) or the brand ilike branch — retry with the minimal set + no brand search.
      let query = supabase.from('items').select(COLUMNS_MIN).order('created_at', { ascending: false }).limit(200);
      if (filter === 'listed') query = query.eq('is_listed', true);
      if (q) {
        const esc = q.replace(/[%,]/g, ' ');
        query = query.or(`name.ilike.%${esc}%,category.ilike.%${esc}%`);
      }
      const { data, error } = await query;
      items = error ? [] : (data ?? []);
    }
  } catch {
    items = [];
  }

  return NextResponse.json({ items: items ?? [] });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { wallet, id, is_listed } = body ?? {};
  if (!(await requireAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!id || typeof id !== 'string' || typeof is_listed !== 'boolean') {
    return NextResponse.json({ error: 'An item id and boolean is_listed are required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  try {
    const patch: Record<string, any> = { is_listed };
    if (is_listed) patch.listed_at = new Date().toISOString();
    const { error } = await supabase.from('items').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  } catch {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, is_listed });
}
