import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_TARGET_TYPES = ['listing', 'seller', 'message'] as const;
type TargetType = typeof VALID_TARGET_TYPES[number];

export async function POST(req: Request) {
  try {
    const { reporter_wallet, target_type, target_id, reason, details } = await req.json();

    const owns = await callerOwnsWallet(req, reporter_wallet);
    if (!owns) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!VALID_TARGET_TYPES.includes(target_type as TargetType)) {
      return NextResponse.json({ error: 'Invalid target_type' }, { status: 400 });
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }
    if (reason.trim().length > 200) {
      return NextResponse.json({ error: 'reason is too long' }, { status: 400 });
    }

    const cappedDetails =
      typeof details === 'string' ? details.slice(0, 2000) : null;

    const supabase = createServiceClient();

    const { error } = await supabase.from('reports').insert({
      reporter_wallet,
      target_type,
      target_id,
      reason: reason.trim(),
      details: cappedDetails,
      status: 'open',
      created_at: new Date().toISOString(),
    });

    if (error) {
      // Already filed an open report on this exact target — the partial-unique dedup index rejects it.
      // Treat as idempotent success so the reporter isn't told their on-file report "failed".
      if (error.code === '23505') {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      const missing =
        error.message?.includes('does not exist') || error.code === '42P01' || error.code === 'PGRST205';
      if (missing) {
        return NextResponse.json({ error: 'Reports table not available yet' }, { status: 503 });
      }
      console.error('[reports/POST] insert error:', error);
      return NextResponse.json({ error: 'Could not save report' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reports/POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
