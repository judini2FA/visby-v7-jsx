import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['open', 'reviewed', 'actioned', 'dismissed'] as const;
type ReportStatus = typeof VALID_STATUSES[number];

async function requireAdmin(req: Request, wallet: string | undefined | null): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet, 'moderator'))) return false;
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
        // Suspension must actually stop the counterfeiter, not just hide their storefront: mint/list
        // routes reject on is_flagged, and here we also delist everything currently live so existing
        // listings don't linger in browse/search until a separate manual force_delist per item.
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

        const { error: delistErr } = await supabase
          .from('items')
          .update({ is_listed: false, price_usdc: null, listed_at: null })
          .eq('current_owner_wallet', target_id)
          .eq('is_listed', true);
        if (delistErr && !isMissing(delistErr)) {
          // Flag already landed (the part that blocks future mint/list); log but don't fail the
          // request — a moderator can still force_delist stragglers individually.
          console.error('[moderation/PATCH flag_user] bulk delist error:', delistErr);
        }
      }

      const { error: repErr } = await supabase
        .from('reports')
        .update({ status: 'actioned', reviewed_at: new Date().toISOString(), reviewed_by: wallet })
        .eq('id', report_id);
      if (repErr && !isMissing(repErr)) {
        console.error('[moderation/PATCH action->report] error:', repErr);
      }
      if (action === 'force_delist') {
        void logSecurityEvent({ wallet, event: 'listing_delisted', detail: { report_id, target_item_or_serial: target_id }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
      } else {
        void logSecurityEvent({ wallet, event: 'user_flagged', detail: { report_id, target_wallet: target_id }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
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

    void logSecurityEvent({ wallet, event: 'report_resolved', detail: { report_id, status }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[moderation/PATCH] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
