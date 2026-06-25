import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { MAX_WEBHOOK_REDELIVERIES } from '@/lib/sdk-webhook';

export const dynamic = 'force-dynamic';

function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code ?? '')) return true;
  return !!error.message?.includes('does not exist');
}

// Read-only view of this merchant's recent SDK orders and their webhook-delivery state, so the
// dashboard can surface deliveries that are pending re-delivery or that gave up. Ownership is
// enforced exactly like the other merchant routes: a valid Privy token controlling owner_wallet,
// and the order query is scoped to merchants the caller owns.
function classify(o: {
  webhook_delivered: boolean;
  webhook_next_attempt_at: string | null;
  webhook_redelivery_count: number;
}): 'delivered' | 'retrying' | 'failed' {
  if (o.webhook_delivered) return 'delivered';
  if (o.webhook_next_attempt_at && o.webhook_redelivery_count < MAX_WEBHOOK_REDELIVERIES) return 'retrying';
  return 'failed';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const owner_wallet = searchParams.get('owner_wallet');
    const merchant_id = searchParams.get('merchant_id');

    if (!owner_wallet) return NextResponse.json({ error: 'Missing owner_wallet' }, { status: 400 });
    if (!merchant_id) return NextResponse.json({ error: 'Missing merchant_id' }, { status: 400 });
    if (!(await callerOwnsWallet(req, owner_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Confirm the merchant belongs to the caller before exposing its orders.
    const { data: merchant, error: merchantErr } = await supabase
      .from('merchants').select('id').eq('id', merchant_id).eq('owner_wallet', owner_wallet).maybeSingle();
    if (merchantErr) {
      if (isMissingSchema(merchantErr)) return NextResponse.json({ deliveries: [], pending_count: 0 });
      return NextResponse.json({ error: 'Could not load deliveries' }, { status: 500 });
    }
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const COLUMNS =
      'id, product_name, status, created_at, paid_at, webhook_delivered, webhook_attempts, webhook_redelivery_count, webhook_next_attempt_at, webhook_last_attempt_at, webhook_last_error';

    const { data, error } = await supabase
      .from('sdk_orders')
      .select(COLUMNS)
      .eq('merchant_id', merchant_id)
      .in('status', ['minted', 'failed'])
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      if (isMissingSchema(error)) return NextResponse.json({ deliveries: [], pending_count: 0 });
      console.error('[merchant/deliveries] list error:', error);
      return NextResponse.json({ error: 'Could not load deliveries' }, { status: 500 });
    }

    // Accurate count of still-undelivered terminal orders, independent of the 30-row window above.
    const { count } = await supabase
      .from('sdk_orders')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchant_id)
      .in('status', ['minted', 'failed'])
      .eq('webhook_delivered', false);

    const deliveries = (data ?? []).map(o => ({ ...o, delivery_status: classify(o) }));
    return NextResponse.json({ deliveries, pending_count: count ?? 0 });
  } catch (err) {
    console.error('[merchant/deliveries] GET error:', err);
    return NextResponse.json({ error: 'Could not load deliveries' }, { status: 500 });
  }
}
