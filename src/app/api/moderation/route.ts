import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminWallet } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['open', 'reviewed', 'actioned', 'dismissed'] as const;
type ReportStatus = typeof VALID_STATUSES[number];

async function requireAdmin(req: Request, wallet: string | undefined | null): Promise<boolean> {
  if (!wallet) return false;
  if (!isAdminWallet(wallet)) return false;
  return callerOwnsWallet(req, wallet);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    const status = searchParams.get('status') ?? 'open';

    const admin = await requireAdmin(req, wallet);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const supabase = createServiceClient();

    const { data: reports, error } = await supabase
      .from('reports')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      const missing =
        error.message?.includes('does not exist') || error.code === '42P01' || error.code === 'PGRST205';
      if (missing) return NextResponse.json({ reports: [] });
      console.error('[moderation/GET] error:', error);
      return NextResponse.json({ reports: [] });
    }

    return NextResponse.json({ reports: reports ?? [] });
  } catch (err) {
    console.error('[moderation/GET] error:', err);
    return NextResponse.json({ reports: [] });
  }
}

const VALID_ACTIONS = ['force_delist', 'flag_user'] as const;
type ModAction = typeof VALID_ACTIONS[number];

function isMissing(error: { message?: string; code?: string } | null): boolean {
  return !!error && (
    error.message?.includes('does not exist') === true ||
    error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703'
  );
}

export async function PATCH(req: Request) {
  try {
    const { wallet, report_id, status, action, target_id } = await req.json();

    const admin = await requireAdmin(req, wallet);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (!report_id) {
      return NextResponse.json({ error: 'report_id is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Enforcement actions take the moderator's intent further than a status flip: delist a reported
    // listing, or flag a reported seller. Both then mark the report 'actioned'.
    if (action !== undefined) {
      if (!VALID_ACTIONS.includes(action as ModAction)) {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }
      if (!target_id || typeof target_id !== 'string') {
        return NextResponse.json({ error: 'target_id is required for this action' }, { status: 400 });
      }

      if (action === 'force_delist') {
        const { error } = await supabase
          .from('items')
          .update({ is_listed: false, price_usdc: null, listed_at: null })
          .eq('id', target_id);
        if (error) {
          console.error('[moderation/PATCH force_delist] error:', error);
          return NextResponse.json({ error: 'Could not delist item' }, { status: 500 });
        }
      } else {
        // flag_user — upsert so it works whether or not the seller already has a profile row.
        const { error } = await supabase
          .from('profiles')
          .upsert({ wallet: target_id, is_flagged: true }, { onConflict: 'wallet' });
        if (error) {
          if (isMissing(error)) {
            return NextResponse.json({ error: 'is_flagged column not migrated yet' }, { status: 503 });
          }
          console.error('[moderation/PATCH flag_user] error:', error);
          return NextResponse.json({ error: 'Could not flag user' }, { status: 500 });
        }
      }

      const { error: repErr } = await supabase
        .from('reports')
        .update({ status: 'actioned', reviewed_at: new Date().toISOString(), reviewed_by: wallet })
        .eq('id', report_id);
      if (repErr && !isMissing(repErr)) {
        console.error('[moderation/PATCH action->report] error:', repErr);
      }
      return NextResponse.json({ ok: true });
    }

    if (!VALID_STATUSES.includes(status as ReportStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { error } = await supabase
      .from('reports')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: wallet,
      })
      .eq('id', report_id);

    if (error) {
      const missing =
        error.message?.includes('does not exist') || error.code === '42P01' || error.code === 'PGRST205';
      if (missing) {
        return NextResponse.json({ error: 'Reports table not available yet' }, { status: 503 });
      }
      console.error('[moderation/PATCH] error:', error);
      return NextResponse.json({ error: 'Could not update report' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[moderation/PATCH] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
