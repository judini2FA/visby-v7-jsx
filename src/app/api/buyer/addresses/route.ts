import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { friendlyError } from '@/lib/friendly-error';

export const dynamic = 'force-dynamic';

// Buyer's address book (blueprint 7.4) — purely additive on top of the single-address
// profiles.ship_to that checkout-modal.tsx reads (via /api/buyer/ship-to, untouched here).
// A buyer can save many addresses; whichever is flagged is_default is ALSO mirrored into
// profiles.ship_to so the money-adjacent checkout path keeps working with zero changes.
// Authed throughout: a buyer reads/writes only their own rows.

const MAX_ADDRESSES = 20;

const LIMITS = [
  ['label', 60], ['name', 200], ['line1', 200], ['line2', 200], ['city', 200],
  ['state', 100], ['postal', 20], ['country', 100],
] as const;

type AddressInput = {
  label?: string; name?: string; line1: string; line2?: string;
  city: string; state: string; postal: string; country?: string;
};

function validateAddress(address: unknown): { error: string } | { clean: Required<Omit<AddressInput, 'label' | 'name' | 'line2' | 'country'>> & { label: string | null; name: string | null; line2: string; country: string } } {
  if (typeof address !== 'object' || address === null || Array.isArray(address)) {
    return { error: 'Invalid address' };
  }
  const a = address as Record<string, unknown>;

  for (const [k, max] of LIMITS) {
    const val = a[k];
    if (val !== undefined && val !== null && typeof val !== 'string') {
      return { error: `Invalid ${k}` };
    }
    if (typeof val === 'string' && val.length > max) {
      return { error: `${k} too long` };
    }
  }

  const required = ['line1', 'city', 'state', 'postal'] as const;
  for (const k of required) {
    if (!a[k] || !String(a[k]).trim()) {
      return { error: `Missing ${k}` };
    }
  }

  return {
    clean: {
      label:   a.label ? String(a.label).trim() : null,
      name:    a.name ? String(a.name).trim() : null,
      line1:   String(a.line1).trim(),
      line2:   a.line2 ? String(a.line2).trim() : '',
      city:    String(a.city).trim(),
      state:   String(a.state).trim(),
      postal:  String(a.postal).trim(),
      country: a.country ? String(a.country).trim() : 'US',
    },
  };
}

// Mirrors the chosen address into profiles.ship_to — the single field checkout-modal.tsx
// reads. Keeps the money-adjacent checkout path in sync without ever touching it directly.
async function writeShipTo(supabase: ReturnType<typeof createServiceClient>, wallet: string, addr: { name: string | null; line1: string; line2: string; city: string; state: string; postal: string; country: string }) {
  const ship_to = {
    name: addr.name,
    line1: addr.line1,
    line2: addr.line2,
    city: addr.city,
    state: addr.state,
    postal: addr.postal,
    country: addr.country,
  };
  await supabase
    .from('profiles')
    .upsert({ wallet, ship_to, updated_at: new Date().toISOString() }, { onConflict: 'wallet' });
}

async function clearOtherDefaults(supabase: ReturnType<typeof createServiceClient>, wallet: string, keepId: string) {
  await supabase
    .from('shipping_addresses')
    .update({ is_default: false })
    .eq('wallet', wallet)
    .neq('id', keepId);
}

export async function GET(req: Request) {
  try {
    const wallet = new URL(req.url).searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ addresses: [] });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = await rateLimit(`addresses-get:${wallet}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('shipping_addresses')
      .select('*')
      .eq('wallet', wallet)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ addresses: [] });
    return NextResponse.json({ addresses: data ?? [] });
  } catch {
    return NextResponse.json({ addresses: [] });
  }
}

export async function POST(req: Request) {
  try {
    const { wallet, address, make_default } = await req.json();
    if (!wallet || !address) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = await rateLimit(`addresses:${wallet}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const result = validateAddress(address);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    const { clean } = result;

    const supabase = createServiceClient();

    const { count, error: countError } = await supabase
      .from('shipping_addresses')
      .select('id', { count: 'exact', head: true })
      .eq('wallet', wallet);
    if (countError) return NextResponse.json({ error: friendlyError(countError, 'Could not save address') }, { status: 500 });
    if ((count ?? 0) >= MAX_ADDRESSES) {
      return NextResponse.json({ error: `You can save up to ${MAX_ADDRESSES} addresses` }, { status: 400 });
    }

    const isFirst = (count ?? 0) === 0;
    const shouldBeDefault = !!make_default || isFirst;

    const { data: inserted, error: insertError } = await supabase
      .from('shipping_addresses')
      .insert({ wallet, ...clean, is_default: shouldBeDefault })
      .select('*')
      .single();
    if (insertError) return NextResponse.json({ error: friendlyError(insertError, 'Could not save address') }, { status: 500 });

    if (shouldBeDefault) {
      await clearOtherDefaults(supabase, wallet, inserted.id);
      await writeShipTo(supabase, wallet, clean);
    }

    return NextResponse.json({ ok: true, address: inserted });
  } catch (err) {
    console.error('[buyer/addresses POST] error:', err);
    return NextResponse.json({ error: 'Could not save address' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const wallet = url.searchParams.get('wallet');
    const id = url.searchParams.get('id');
    if (!wallet || !id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = await rateLimit(`addresses:${wallet}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('shipping_addresses')
      .delete()
      .eq('wallet', wallet)
      .eq('id', id);
    if (error) return NextResponse.json({ error: friendlyError(error, 'Could not delete address') }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[buyer/addresses DELETE] error:', err);
    return NextResponse.json({ error: 'Could not delete address' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { wallet, id, make_default } = await req.json();
    if (!wallet || !id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!make_default) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = await rateLimit(`addresses:${wallet}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();

    const { data: target, error: fetchError } = await supabase
      .from('shipping_addresses')
      .select('*')
      .eq('wallet', wallet)
      .eq('id', id)
      .maybeSingle();
    if (fetchError) return NextResponse.json({ error: friendlyError(fetchError, 'Could not update address') }, { status: 500 });
    if (!target) return NextResponse.json({ error: 'Address not found' }, { status: 404 });

    const { error: updateError } = await supabase
      .from('shipping_addresses')
      .update({ is_default: true })
      .eq('wallet', wallet)
      .eq('id', id);
    if (updateError) return NextResponse.json({ error: friendlyError(updateError, 'Could not update address') }, { status: 500 });

    await clearOtherDefaults(supabase, wallet, id);
    await writeShipTo(supabase, wallet, target);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[buyer/addresses PATCH] error:', err);
    return NextResponse.json({ error: 'Could not update address' }, { status: 500 });
  }
}
