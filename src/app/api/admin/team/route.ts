import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole, listAdmins, grantAdmin, revokeAdmin, ADMIN_ROLES, type AdminRole } from '@/lib/admin';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Only a super_admin (env-bootstrap or DB) who also proves wallet ownership can view/manage the roster.
async function requireSuperAdmin(req: Request, wallet: string | null | undefined): Promise<boolean> {
  if (!wallet) return false;
  if (!(await isAdminRole(wallet, 'super_admin'))) return false;
  return callerOwnsWallet(req, wallet);
}

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!(await requireSuperAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ admins: await listAdmins(), roles: ADMIN_ROLES });
}

export async function POST(req: Request) {
  const { wallet, target_wallet, role } = await req.json().catch(() => ({}));
  if (!(await requireSuperAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!target_wallet || typeof target_wallet !== 'string' || !ADMIN_ROLES.includes(role as AdminRole)) {
    return NextResponse.json({ error: 'A target wallet and valid role are required' }, { status: 400 });
  }
  const r = await grantAdmin(target_wallet, role as AdminRole, wallet);
  if (!r.ok) return NextResponse.json({ error: r.error ?? 'Could not grant' }, { status: 400 });
  void logSecurityEvent({ wallet, event: 'admin_granted', detail: { target_wallet, role }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { wallet, target_wallet } = await req.json().catch(() => ({}));
  if (!(await requireSuperAdmin(req, wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!target_wallet || typeof target_wallet !== 'string') return NextResponse.json({ error: 'No target wallet' }, { status: 400 });
  const r = await revokeAdmin(target_wallet);
  if (!r.ok) return NextResponse.json({ error: r.error ?? 'Could not revoke' }, { status: 400 });
  void logSecurityEvent({ wallet, event: 'admin_revoked', detail: { target_wallet }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
  return NextResponse.json({ ok: true });
}
