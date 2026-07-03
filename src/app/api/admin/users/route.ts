export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

// Admin user directory. GET lists profiles (any admin role may read). The ONLY mutation is PATCH, which
// toggles profiles.is_flagged — a fully reversible flag/unflag. Every query is fail-soft: a missing
// table/column returns an empty list rather than a 500.
async function requireAdmin(req: Request, wallet: string | null | undefined): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet))) return false;
  return callerOwnsWallet(req, wallet);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get('wallet');
  if (!(await requireAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const q = (url.searchParams.get('q') ?? '').trim();
  const filter = url.searchParams.get('filter') === 'flagged' ? 'flagged' : 'all';

  const supabase = createServiceClient();

  // Resilient read: `profiles` is ALTER-built (no base create-table in these migrations), so `created_at`
  // and the later kyc/flag/avatar columns may not exist on every deployment. Try the full set + newest-
  // first, then degrade — rather than returning an empty list on a single missing column, which
  // previously rendered as a misleading "no users". (`bio` was such a phantom column and broke this.)
  // Column availability varies by which migrations a deployment has applied (prod is currently missing
  // kyc_status / account_type / created_at). Degrade through progressively smaller column sets, each tried
  // with and without the created_at sort, so real users always show even when later migrations aren't run.
  const SETS = [
    'wallet, display_name, avatar_url, kyc_status, account_type, is_flagged, account_status, created_at',
    'wallet, display_name, avatar_url, kyc_status, account_type, is_flagged, created_at',
    'wallet, display_name, avatar_url, is_flagged',
    'wallet, display_name',
  ];

  const build = (columns: string, ordered: boolean) => {
    let query = supabase.from('profiles').select(columns).limit(200);
    if (ordered) query = query.order('created_at', { ascending: false });
    if (filter === 'flagged') query = query.eq('is_flagged', true);
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      query = query.or(`wallet.ilike.${like},display_name.ilike.${like}`);
    }
    return query;
  };

  let users: any[] | null = null;
  let lastErr: string | undefined;
  outer: for (const cols of SETS) {
    for (const ordered of [true, false]) {
      const { data, error } = await build(cols, ordered);
      if (!error) { users = data ?? []; break outer; }
      lastErr = error.message;
    }
  }
  if (users === null) {
    console.error('[admin/users] query failed after fallbacks:', lastErr);
    users = [];
  }

  return NextResponse.json({ users: users ?? [] });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const wallet: string | undefined = body?.wallet;
  const target: string | undefined = body?.target_wallet;
  const is_flagged = body?.is_flagged;

  if (!(await requireAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!target || typeof target !== 'string' || typeof is_flagged !== 'boolean') {
    return NextResponse.json({ error: 'A target wallet and is_flagged boolean are required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('profiles').update({ is_flagged }).eq('wallet', target);
  if (error) return NextResponse.json({ error: 'Could not update' }, { status: 500 });

  void logSecurityEvent({
    wallet: wallet!,
    event: 'user_flagged',
    detail: { target_wallet: target, is_flagged },
    ip: clientIp(req),
    user_agent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ ok: true });
}
