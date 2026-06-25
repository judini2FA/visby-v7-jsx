export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { captureMessage } from '@/lib/monitoring';

// Settlement reconciliation sweep. Surfaces money that's stuck after a cleared payment so it doesn't sit
// silently: (1) SDK orders paid but never minted (status='failed'), and (2) marketplace orders confirmed
// delivered but whose seller payout never released. Read-only — it only DETECTS + alerts (the dedicated
// mint-retry/payout-retry paths do the healing). CRON_SECRET-gated, fail-closed, like the other crons.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers.get('x-cron-secret') ?? '');
  if (!provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  let stuckSdkMints: string[] = [];
  let stuckPayouts: string[] = [];

  try {
    const { data } = await supabase
      .from('sdk_orders').select('id').eq('status', 'failed').lt('created_at', staleBefore).limit(100);
    stuckSdkMints = (data ?? []).map((r: any) => r.id);
  } catch { /* table/column absent pre-migration — skip */ }

  try {
    const { data } = await supabase
      .from('orders').select('id').eq('status', 'delivered').eq('payout_released', false).lt('created_at', staleBefore).limit(100);
    stuckPayouts = (data ?? []).map((r: any) => r.id);
  } catch { /* skip */ }

  if (stuckSdkMints.length) captureMessage('error', '[reconcile] SDK orders paid but not minted', { count: stuckSdkMints.length, ids: stuckSdkMints.slice(0, 20) });
  if (stuckPayouts.length) captureMessage('error', '[reconcile] delivered orders with payout not released', { count: stuckPayouts.length, ids: stuckPayouts.slice(0, 20) });

  return NextResponse.json({
    ok: true,
    stuck_sdk_mints: stuckSdkMints.length,
    stuck_payouts: stuckPayouts.length,
    ids: { sdk_mints: stuckSdkMints.slice(0, 20), payouts: stuckPayouts.slice(0, 20) },
  });
}

export { handle as GET, handle as POST };
