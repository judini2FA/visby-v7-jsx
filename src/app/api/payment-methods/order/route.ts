import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { friendlyError } from '@/lib/friendly-error';

export const dynamic = 'force-dynamic';

// The user's payment-method order (favorites order; index 0 = default/Primary). Server source of truth
// so it follows them across devices and feeds the VisbyPay SDK checkout. Authed: own wallet only.

export async function GET(req: Request) {
  try {
    const wallet = new URL(req.url).searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ order: [] });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createServiceClient();
    const { data } = await supabase.from('profiles').select('payment_order').eq('wallet', wallet).maybeSingle();
    const order = Array.isArray(data?.payment_order) ? data!.payment_order : [];
    return NextResponse.json({ order });
  } catch {
    return NextResponse.json({ order: [] });
  }
}

export async function POST(req: Request) {
  try {
    const { wallet, order } = await req.json();
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!Array.isArray(order) || order.length > 50 || order.some(id => typeof id !== 'string' || id.length > 128)) {
      return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('profiles')
      .upsert({ wallet, payment_order: order, updated_at: new Date().toISOString() }, { onConflict: 'wallet' });
    if (error) return NextResponse.json({ error: friendlyError(error, 'Could not save order') }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[payment-methods/order] error:', err);
    return NextResponse.json({ error: 'Could not save order' }, { status: 500 });
  }
}
