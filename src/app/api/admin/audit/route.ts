import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

async function requireSuperAdmin(req: Request, wallet: string | null | undefined): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet, 'super_admin'))) return false;
  return callerOwnsWallet(req, wallet);
}

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!(await requireSuperAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('security_audit_log')
    .select('id, wallet, event, detail, ip, user_agent, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    const missing =
      error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('does not exist');
    if (missing) return NextResponse.json({ events: [] });
    console.error('[admin/audit/GET] error:', error);
    return NextResponse.json({ events: [] });
  }

  return NextResponse.json({ events: data ?? [] });
}
