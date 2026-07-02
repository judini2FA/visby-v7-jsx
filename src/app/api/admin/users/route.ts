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

  let users: any[] = [];
  try {
    let query = supabase
      .from('profiles')
      .select('wallet, display_name, avatar_url, bio, kyc_status, account_type, is_flagged, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (filter === 'flagged') query = query.eq('is_flagged', true);
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      query = query.or(`wallet.ilike.${like},display_name.ilike.${like}`);
    }

    const { data, error } = await query;
    users = error ? [] : (data ?? []);
  } catch {
    users = [];
  }

  return NextResponse.json({ users });
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
