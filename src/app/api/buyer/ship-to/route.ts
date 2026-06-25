import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// The buyer's saved default shipping address (profiles.ship_to). Snapshotted onto each order at
// purchase so checkout never needs a separate post-purchase address step. Authed: a buyer reads/writes
// only their own.

export async function GET(req: Request) {
  try {
    const wallet = new URL(req.url).searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ ship_to: null });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const { error } = await supabase
      .from('profiles')
      .upsert({ wallet: buyer_wallet, ship_to: clean, updated_at: new Date().toISOString() }, { onConflict: 'wallet' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, ship_to: clean });
  } catch (err) {
    console.error('[buyer/ship-to] error:', err);
    return NextResponse.json({ error: 'Could not save shipping address' }, { status: 500 });
  }
}
