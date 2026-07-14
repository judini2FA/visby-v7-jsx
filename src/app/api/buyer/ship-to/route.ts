import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { friendlyError } from '@/lib/friendly-error';

export const dynamic = 'force-dynamic';

// The buyer's saved default shipping address (profiles.ship_to). Snapshotted onto each order at
// purchase so checkout never needs a separate post-purchase address step. Authed: a buyer reads/writes
// only their own.
//
// POL3: this is also the address checkout-modal.tsx saves to when a buyer types a new address at
// checkout. It must land in the SAME address book that /api/buyer/addresses (7.4) reads, or the
// checkout-entered address silently never shows up in Settings → Address Book. So POST here also
// upserts the buyer's default row in shipping_addresses (updating it in place if one already exists,
// so re-saving at checkout doesn't spam new rows), mirroring the default-write pattern
// /api/buyer/addresses already uses in the other direction.
async function upsertDefaultShippingAddress(supabase: ReturnType<typeof createServiceClient>, wallet: string, addr: { name: string | null; line1: string; line2: string; city: string; state: string; postal: string; country: string }) {
  try {
    const { data: existingDefaults } = await supabase
      .from('shipping_addresses')
      .select('id')
      .eq('wallet', wallet)
      .eq('is_default', true)
      .order('created_at', { ascending: false })
      .limit(1);
    const existingDefault = existingDefaults?.[0];

    if (existingDefault) {
      await supabase.from('shipping_addresses').update(addr).eq('id', existingDefault.id);
      return;
    }

    const { count } = await supabase
      .from('shipping_addresses')
      .select('id', { count: 'exact', head: true })
      .eq('wallet', wallet);
    if ((count ?? 0) >= 20) return; // address book full — profiles.ship_to still saved, just not mirrored

    await supabase.from('shipping_addresses').insert({ wallet, ...addr, is_default: true });
  } catch {
    // Best-effort mirror — never fail the checkout-critical ship_to save over this.
  }
}

function addrKey(line1: unknown, postal: unknown): string {
  return `${String(line1 ?? '').trim().toLowerCase()}|${String(postal ?? '').trim().toLowerCase()}`;
}

// POL3: saving a NEW default address must not silently lose the address it's replacing. Before
// overwriting profiles.ship_to, if the OLD address materially differs from the incoming one (different
// street1+zip, case-insensitive), archive it into the address book as a non-default entry — skipping
// silently if it's already in the book (matched the same way) or the book is already at its cap. Mirrors
// upsertDefaultShippingAddress's fail-soft style: never blocks the checkout-critical ship_to write.
async function preserveOldAddressIfDifferent(
  supabase: ReturnType<typeof createServiceClient>,
  wallet: string,
  oldShipTo: unknown,
  newClean: { line1: string; postal: string },
) {
  try {
    if (typeof oldShipTo !== 'object' || oldShipTo === null || Array.isArray(oldShipTo)) return;
    const o = oldShipTo as Record<string, unknown>;
    if (!o.line1 || !String(o.line1).trim() || !o.postal || !String(o.postal).trim()) return;
    if (addrKey(o.line1, o.postal) === addrKey(newClean.line1, newClean.postal)) return; // unchanged — nothing to preserve

    const oldAddr = {
      name:    o.name ? String(o.name).trim() : null,
      line1:   String(o.line1).trim(),
      line2:   o.line2 ? String(o.line2).trim() : '',
      city:    o.city ? String(o.city).trim() : '',
      state:   o.state ? String(o.state).trim() : '',
      postal:  String(o.postal).trim(),
      country: o.country ? String(o.country).trim() : 'US',
    };

    const { data: existingRows } = await supabase
      .from('shipping_addresses')
      .select('line1, postal')
      .eq('wallet', wallet);
    const alreadyBooked = ((existingRows ?? []) as { line1: string; postal: string }[])
      .some((r) => addrKey(r.line1, r.postal) === addrKey(oldAddr.line1, oldAddr.postal));
    if (alreadyBooked) return;

    const { count } = await supabase
      .from('shipping_addresses')
      .select('id', { count: 'exact', head: true })
      .eq('wallet', wallet);
    if ((count ?? 0) >= 20) return; // address book full — best-effort preservation, never blocks the save

    await supabase.from('shipping_addresses').insert({ wallet, ...oldAddr, is_default: false });
  } catch {
    // Best-effort — never fail the checkout-critical ship_to save over this.
  }
}

export async function GET(req: Request) {
  try {
    const wallet = new URL(req.url).searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ ship_to: null });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = await rateLimit(`ship-to-get:${wallet}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();
    const { data } = await supabase.from('profiles').select('ship_to').eq('wallet', wallet).maybeSingle();
    return NextResponse.json({ ship_to: data?.ship_to ?? null });
  } catch {
    return NextResponse.json({ ship_to: null });
  }
}

export async function POST(req: Request) {
  try {
    const { buyer_wallet, ship_to } = await req.json();
    if (!buyer_wallet || !ship_to) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = await rateLimit(`ship-to:${buyer_wallet}`, { limit: 20, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    if (typeof ship_to !== 'object' || Array.isArray(ship_to)) {
      return NextResponse.json({ error: 'Invalid ship_to' }, { status: 400 });
    }

    // Reject non-string / oversized fields before coercion (an object value would survive String()
    // as "[object Object]" and pass the required check).
    const limits = [
      ['name', 200], ['line1', 200], ['line2', 200], ['city', 200],
      ['state', 100], ['postal', 20], ['country', 100],
    ] as const;
    for (const [k, max] of limits) {
      const val = (ship_to as Record<string, unknown>)[k];
      if (val !== undefined && val !== null && typeof val !== 'string') {
        return NextResponse.json({ error: `Invalid ${k}` }, { status: 400 });
      }
      if (typeof val === 'string' && val.length > max) {
        return NextResponse.json({ error: `${k} too long` }, { status: 400 });
      }
    }

    const required = ['line1', 'city', 'state', 'postal'] as const;
    for (const k of required) {
      if (!ship_to[k] || !String(ship_to[k]).trim()) {
        return NextResponse.json({ error: `Missing ${k}` }, { status: 400 });
      }
    }

    const clean = {
      name:    ship_to.name ? String(ship_to.name).trim() : null,
      line1:   String(ship_to.line1).trim(),
      line2:   ship_to.line2 ? String(ship_to.line2).trim() : '',
      city:    String(ship_to.city).trim(),
      state:   String(ship_to.state).trim(),
      postal:  String(ship_to.postal).trim(),
      country: ship_to.country ? String(ship_to.country).trim() : 'US',
    };

    const supabase = createServiceClient();

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('ship_to')
      .eq('wallet', buyer_wallet)
      .maybeSingle();
    await preserveOldAddressIfDifferent(supabase, buyer_wallet, existingProfile?.ship_to, clean);

    const { error } = await supabase
      .from('profiles')
      .upsert({ wallet: buyer_wallet, ship_to: clean, updated_at: new Date().toISOString() }, { onConflict: 'wallet' });
    if (error) return NextResponse.json({ error: friendlyError(error, 'Could not save shipping address') }, { status: 500 });

    await upsertDefaultShippingAddress(supabase, buyer_wallet, clean);

    return NextResponse.json({ ok: true, ship_to: clean });
  } catch (err) {
    console.error('[buyer/ship-to] error:', err);
    return NextResponse.json({ error: 'Could not save shipping address' }, { status: 500 });
  }
}
