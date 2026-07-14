export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { friendlyError } from '@/lib/friendly-error';

// Pre-mint inventory log: a business account writes serials it physically holds as 'pending'
// rows here. Nothing is minted — /item and /mint own that step (2.3). This route only owns
// getting genuine-inventory serials into the table and letting the business review them.

const MAX_ROWS = 1000;
// Expected CSV column order (mirrored as a plain-text hint in the dashboard UI).
const CSV_COLUMNS = ['serial_number', 'name', 'category', 'condition', 'description', 'image_url', 'brand', 'price_usdc'] as const;

type RawRow = Record<string, string | undefined>;
type InsertRow = {
  business_wallet: string;
  serial_number: string;
  name: string;
  category: string | null;
  condition: string | null;
  description: string | null;
  image_url: string | null;
  brand: string | null;
  price_usdc: number | null;
  status: 'pending';
};

// Small hand-rolled CSV parser — no new dependency. Handles quoted fields ("a,b" / "" escape),
// embedded commas, embedded newlines inside quotes, and both \n and \r\n line endings.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function pushField() { row.push(field); field = ''; }
  function pushRow() { pushField(); rows.push(row); row = []; }

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; } // normalize CRLF — the \n right after closes the row
    if (ch === '\n') { pushRow(); i++; continue; }
    field += ch; i++;
  }
  // Final field/row if the text didn't end with a newline.
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

function csvToRows(csv: string): RawRow[] {
  const table = parseCsv(csv);
  if (table.length === 0) return [];
  // Only keep recognized columns — an extra/misspelled header just gets ignored rather than
  // silently polluting the row object with a key normalizeRow() never looks at.
  const known = new Set<string>(CSV_COLUMNS);
  const header = table[0].map(h => h.trim().toLowerCase());
  const out: RawRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const obj: RawRow = {};
    header.forEach((col, idx) => { if (known.has(col)) obj[col] = cells[idx]?.trim(); });
    out.push(obj);
  }
  return out;
}

function normalizeRow(raw: RawRow, wallet: string): { row?: InsertRow; error?: string } {
  const serial_number = (raw.serial_number ?? '').toString().trim();
  const name = (raw.name ?? '').toString().trim();
  if (!serial_number) return { error: 'missing serial_number' };
  if (!name) return { error: 'missing name' };

  let price_usdc: number | null = null;
  const rawPrice = raw.price_usdc;
  if (rawPrice !== undefined && rawPrice !== null && String(rawPrice).trim() !== '') {
    const n = Number(rawPrice);
    if (!Number.isFinite(n) || n < 0) return { error: 'invalid price_usdc' };
    price_usdc = n;
  }

  return {
    row: {
      business_wallet: wallet,
      serial_number,
      name,
      category: (raw.category ?? '').toString().trim() || null,
      condition: (raw.condition ?? '').toString().trim() || null,
      description: (raw.description ?? '').toString().trim() || null,
      image_url: (raw.image_url ?? '').toString().trim() || null,
      brand: (raw.brand ?? '').toString().trim() || null,
      price_usdc,
      status: 'pending',
    },
  };
}

export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const wallet: string | undefined = body?.wallet;
  if (!wallet || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`bulk-serials:${ctx.userId}`, { limit: 10, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from('profiles').select('account_type').eq('wallet', wallet).maybeSingle();
  if ((profile?.account_type ?? 'personal') !== 'business') {
    return NextResponse.json({ error: 'Bulk serial logging is only available on business accounts' }, { status: 403 });
  }

  let rawRows: RawRow[] = [];
  if (Array.isArray(body?.rows)) {
    rawRows = body.rows;
  } else if (typeof body?.csv === 'string') {
    rawRows = csvToRows(body.csv);
  } else {
    return NextResponse.json({ error: 'Provide either csv (string) or rows (array)' }, { status: 400 });
  }

  if (rawRows.length === 0) return NextResponse.json({ error: 'No rows to log' }, { status: 400 });
  if (rawRows.length > MAX_ROWS) return NextResponse.json({ error: `Cap is ${MAX_ROWS} rows per request` }, { status: 400 });

  const errors: string[] = [];
  const toInsert: InsertRow[] = [];
  const seen = new Set<string>();
  rawRows.forEach((raw, idx) => {
    const { row, error } = normalizeRow(raw, wallet);
    if (error || !row) { errors.push(`row ${idx + 1}: ${error}`); return; }
    // Dedupe within the same request too, not just against existing DB rows.
    if (seen.has(row.serial_number)) { errors.push(`row ${idx + 1}: duplicate serial_number in request`); return; }
    seen.add(row.serial_number);
    toInsert.push(row);
  });

  let inserted = 0;
  let skipped = 0;
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from('pending_serials')
      .upsert(toInsert, { onConflict: 'business_wallet,serial_number', ignoreDuplicates: true })
      .select('serial_number');
    if (error) return NextResponse.json({ error: friendlyError(error, 'Insert failed — try again.') }, { status: 500 });
    inserted = data?.length ?? 0;
    skipped = toInsert.length - inserted;
  }

  return NextResponse.json({ inserted, skipped, errors });
}

// Publish controls: a business flips `available` / edits `price_usdc` on a row it already
// pre-logged. Kept separate from POST (bulk insert) since this mutates a single existing row
// and carries its own "can't go live with no price" invariant.
export async function PATCH(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const wallet: string | undefined = body?.wallet;
  const id: string | undefined = body?.id;
  if (!wallet || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const rl = await rateLimit(`bulk-serials-patch:${ctx.userId}`, { limit: 30, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from('profiles').select('account_type').eq('wallet', wallet).maybeSingle();
  if ((profile?.account_type ?? 'personal') !== 'business') {
    return NextResponse.json({ error: 'Bulk serial logging is only available on business accounts' }, { status: 403 });
  }

  const hasAvailable = Object.prototype.hasOwnProperty.call(body, 'available');
  const hasPrice = Object.prototype.hasOwnProperty.call(body, 'price_usdc');
  if (!hasAvailable && !hasPrice) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  let price_usdc: number | null | undefined;
  if (hasPrice) {
    const raw = body.price_usdc;
    if (raw === null) {
      price_usdc = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'invalid_price', message: 'price_usdc must be a positive number' }, { status: 400 });
      price_usdc = n;
    }
  }

  let available: boolean | undefined;
  if (hasAvailable) {
    if (typeof body.available !== 'boolean') return NextResponse.json({ error: 'invalid_available', message: 'available must be a boolean' }, { status: 400 });
    available = body.available;
  }

  // Row must belong to this business — a business may only edit its own pending_serials.
  const { data: existing, error: loadError } = await supabase
    .from('pending_serials')
    .select('id, status, price_usdc, available')
    .eq('id', id)
    .eq('business_wallet', wallet)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: friendlyError(loadError, 'Lookup failed — try again.') }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'not_pending', message: `Row is already ${existing.status}` }, { status: 409 });
  }

  // Can't publish without a positive price — check the price the row would end up with,
  // not just what this request happens to touch.
  const resultingPrice = hasPrice ? price_usdc : existing.price_usdc;
  const resultingAvailable = hasAvailable ? available : existing.available;
  if (resultingAvailable === true && !(typeof resultingPrice === 'number' && resultingPrice > 0)) {
    return NextResponse.json({ error: 'price_required', message: 'Set a price before publishing this serial' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (hasPrice) update.price_usdc = price_usdc;
  if (hasAvailable) update.available = available;

  const { data: updated, error: updateError } = await supabase
    .from('pending_serials')
    .update(update)
    .eq('id', id)
    .eq('business_wallet', wallet)
    .select('*')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: friendlyError(updateError, 'Update failed — try again.') }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ row: updated });
}

export async function GET(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const wallet = url.searchParams.get('wallet');
  if (!wallet || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('pending_serials')
    .select('*')
    .eq('business_wallet', wallet)
    .order('created_at', { ascending: false });
  // 'pending' rows first (what the management list cares about), newest within each group first.
  const sorted = (data ?? []).slice().sort((a: any, b: any) => {
    if (a.status === b.status) return 0;
    if (a.status === 'pending') return -1;
    if (b.status === 'pending') return 1;
    return 0;
  });
  if (error) return NextResponse.json({ error: friendlyError(error, 'Lookup failed — try again.') }, { status: 500 });

  return NextResponse.json({ rows: sorted });
}
