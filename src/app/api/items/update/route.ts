import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { isRestricted } from '@/lib/account-status';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { friendlyError } from '@/lib/friendly-error';

export const dynamic = 'force-dynamic';

const MAX_EXTRA_PHOTOS = 8;
const MAX_DESCRIPTION_LEN = 4000;

// Owner-only edit of a LIVE listing (12b L2). Title/name and the original cover image_url are
// permanently locked here — this route only ever APPENDS to extra_image_urls (never removes/replaces
// the originals) and optionally replaces the description text.
export async function POST(req: NextRequest) {
  let body: { item_id?: unknown; wallet?: unknown; description?: unknown; add_image_urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { item_id, wallet, description, add_image_urls } = body as {
    item_id?: string; wallet?: string; description?: string; add_image_urls?: string[];
  };

  if (!item_id || !wallet) {
    return NextResponse.json({ error: 'item_id and wallet are required' }, { status: 400 });
  }

  const hasDescription = description !== undefined;
  const hasNewPhotos = Array.isArray(add_image_urls) && add_image_urls.length > 0;
  if (!hasDescription && !hasNewPhotos) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  if (hasDescription && typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 });
  }
  if (hasDescription && (description as string).length > MAX_DESCRIPTION_LEN) {
    return NextResponse.json({ error: 'description is too long' }, { status: 400 });
  }

  if (add_image_urls !== undefined) {
    if (!Array.isArray(add_image_urls) || add_image_urls.some(u => typeof u !== 'string' || !u.trim())) {
      return NextResponse.json({ error: 'add_image_urls must be an array of URLs' }, { status: 400 });
    }
  }

  const owns = await callerOwnsWallet(req, wallet);
  if (!owns) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`items-update:${clientIp(req)}`, { limit: 20, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  if (await isRestricted([wallet])) {
    return NextResponse.json({ error: 'account_suspended' }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: item, error: fetchErr } = await supabase
    .from('items')
    .select('id, current_owner_wallet, extra_image_urls')
    .eq('id', item_id)
    .maybeSingle();

  if (fetchErr || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  if (item.current_owner_wallet !== wallet) {
    return NextResponse.json({ error: 'Only the current owner can edit this item' }, { status: 403 });
  }

  const update: Record<string, unknown> = {};

  if (hasDescription) {
    update.description = (description as string).trim() || null;
  }

  if (hasNewPhotos) {
    const existing: string[] = Array.isArray(item.extra_image_urls) ? item.extra_image_urls : [];
    const merged = [...existing, ...(add_image_urls as string[])].slice(0, MAX_EXTRA_PHOTOS);
    update.extra_image_urls = merged;
  }

  const { data, error } = await supabase
    .from('items')
    .update(update)
    .eq('id', item_id)
    .eq('current_owner_wallet', wallet)
    .select()
    .single();

  if (error) {
    const missing =
      error.code === '42703' || error.code === '42P01' || error.code === 'PGRST205' ||
      !!error.message?.includes('does not exist');
    if (missing) {
      return NextResponse.json({ error: 'Editing is not available yet' }, { status: 503 });
    }
    return NextResponse.json({ error: friendlyError(error, 'Could not save these changes — try again.') }, { status: 400 });
  }

  return NextResponse.json(data);
}
