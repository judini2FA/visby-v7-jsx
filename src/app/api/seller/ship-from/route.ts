import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// The seller's ship-from (return) address, stored on profiles.ship_from. Required before an
// automatic carrier label can be purchased. Authed: a seller reads/writes only their own.

export async function GET(req: Request) {
  try {
    const wallet = new URL(req.url).searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ ship_from: null });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createServiceClient();
    const { data } = await supabase.from('profiles').select('ship_from').eq('wallet', wallet).maybeSingle();
    return NextResponse.json({ ship_from: data?.ship_from ?? null });
  } catch {
    return NextResponse.json({ ship_from: null });
  }
}

export async function POST(req: Request) {
  try {
    const { seller_wallet, ship_from } = await req.json();
    if (!seller_wallet || !ship_from) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, seller_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const required = ['street1', 'city', 'state', 'zip'] as const;
    for (const k of required) {
      if (!ship_from[k] || !String(ship_from[k]).trim()) {
        return NextResponse.json({ error: `Missing ${k}` }, { status: 400 });
      }
    }

    const clean = {
      name:    ship_from.name ? String(ship_from.name).trim() : null,
      street1: String(ship_from.street1).trim(),
      street2: ship_from.street2 ? String(ship_from.street2).trim() : null,
      city:    String(ship_from.city).trim(),
      state:   String(ship_from.state).trim(),
      zip:     String(ship_from.zip).trim(),
      country: ship_from.country ? String(ship_from.country).trim() : 'US',
      phone:   ship_from.phone ? String(ship_from.phone).trim() : null,
    };

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('profiles')
      .upsert({ wallet: seller_wallet, ship_from: clean, updated_at: new Date().toISOString() }, { onConflict: 'wallet' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, ship_from: clean });
  } catch (err) {
    console.error('[seller/ship-from] error:', err);
    return NextResponse.json({ error: 'Could not save ship-from address' }, { status: 500 });
  }
}
