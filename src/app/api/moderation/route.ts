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

const VALID_ACTIONS = ['force_delist', 'flag_user', 'suspend_user', 'ban_user', 'reinstate_user'] as const;
type ModAction = typeof VALID_ACTIONS[number];

// Actions that operate on a user (target_id = wallet) rather than a report row. These are launched
// from the admin Users page, not a specific report, so report_id is optional for them — only
// force_delist/flag_user (report-driven) still require one.
const USER_LEVEL_ACTIONS: ModAction[] = ['flag_user', 'suspend_user', 'ban_user', 'reinstate_user'];

function isMissing(error: { message?: string; code?: string } | null): boolean {
  return !!error && (
    error.message?.includes('does not exist') === true ||
    error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703'
  );
}

export async function PATCH(req: Request) {
  try {
    const { wallet, report_id, status, action, target_id, reason } = await req.json();

    const admin = await requireAdmin(req, wallet);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // report_id is required for the plain status-flip path and for the report-driven actions
    // (force_delist / flag_user). User-level actions (suspend_user/ban_user/reinstate_user) are
    // launched from the admin Users page against a wallet, not a report, so it's optional there —
    // when present we still update that report's row as a side effect.
    const isUserLevelAction = action !== undefined && USER_LEVEL_ACTIONS.includes(action as ModAction);
    if (!report_id && !isUserLevelAction) {
      return NextResponse.json({ error: 'report_id is required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const modReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

    // Enforcement actions take the moderator's intent further than a status flip: delist a reported
    // listing, flag/suspend/ban a seller, or reinstate one. Report-driven actions then mark the report
    // 'actioned'; user-level actions only touch the report if one was actually passed.
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
      } else if (action === 'reinstate_user') {
        // Clears the moderation lifecycle back to normal. Deliberately does NOT re-list the user's
        // items — a suspended/banned seller's listings were pulled for a reason; they relist themselves
        // once reinstated, giving them a chance to fix whatever triggered the action.
        const { error } = await supabase
          .from('profiles')
          .upsert({
            wallet: target_id,
            account_status: 'active',
            is_flagged: false,
            moderation_reason: null,
            moderated_at: new Date().toISOString(),
            moderated_by: wallet,
          }, { onConflict: 'wallet' });
        if (error) {
          if (isMissing(error)) {
            return NextResponse.json({ error: 'account_status column not migrated yet' }, { status: 503 });
          }
          console.error('[moderation/PATCH reinstate_user] error:', error);
          return NextResponse.json({ error: 'Could not reinstate user' }, { status: 500 });
        }
      } else {
        // flag_user (alias of suspend_user) / suspend_user / ban_user — upsert so it works whether or
        // not the seller already has a profile row. Suspension/ban must actually stop the counterfeiter,
        // not just hide their storefront: mint/list routes reject on account_status/is_flagged, and here
        // we also delist everything currently live so existing listings don't linger in browse/search
        // until a separate manual force_delist per item. is_flagged is kept in sync as the legacy signal.
        const newStatus: 'suspended' | 'banned' = action === 'ban_user' ? 'banned' : 'suspended';
        const { error } = await supabase
          .from('profiles')
          .upsert({
            wallet: target_id,
            account_status: newStatus,
            is_flagged: true,
            moderation_reason: modReason,
            moderated_at: new Date().toISOString(),
            moderated_by: wallet,
          }, { onConflict: 'wallet' });
        if (error) {
          if (isMissing(error)) {
            return NextResponse.json({ error: 'account_status column not migrated yet' }, { status: 503 });
          }
          console.error(`[moderation/PATCH ${action}] error:`, error);
          return NextResponse.json({ error: 'Could not update user status' }, { status: 500 });
        }

        const { error: delistErr } = await supabase
          .from('items')
          .update({ is_listed: false, price_usdc: null, listed_at: null })
          .eq('current_owner_wallet', target_id)
          .eq('is_listed', true);
        if (delistErr && !isMissing(delistErr)) {
          // Flag/status already landed (the part that blocks future mint/list); log but don't fail the
          // request — a moderator can still force_delist stragglers individually.
          console.error(`[moderation/PATCH ${action}] bulk delist error:`, delistErr);
        }
      }

      if (report_id) {
        const { error: repErr } = await supabase
          .from('reports')
          .update({ status: 'actioned', reviewed_at: new Date().toISOString(), reviewed_by: wallet })
          .eq('id', report_id);
        if (repErr && !isMissing(repErr)) {
          console.error('[moderation/PATCH action->report] error:', repErr);
        }
      }

      if (action === 'force_delist') {
        void logSecurityEvent({ wallet, event: 'listing_delisted', detail: { report_id, target_item_or_serial: target_id }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
      } else if (action === 'reinstate_user') {
        void logSecurityEvent({ wallet, event: 'user_reinstated', detail: { report_id, target_wallet: target_id }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
      } else if (action === 'ban_user') {
        void logSecurityEvent({ wallet, event: 'user_banned', detail: { report_id, target_wallet: target_id, reason: modReason }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
      } else {
        // suspend_user or its flag_user alias
        void logSecurityEvent({ wallet, event: 'user_suspended', detail: { report_id, target_wallet: target_id, reason: modReason }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
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
