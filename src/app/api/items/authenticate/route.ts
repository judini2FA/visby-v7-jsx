export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

const VALID_STATUSES = ['unverified', 'authenticated', 'flagged'] as const;
type AuthStatus = (typeof VALID_STATUSES)[number];

export async function POST(req: NextRequest) {
  let body: { wallet?: unknown; item_id?: unknown; auth_status?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wallet, item_id, auth_status, note } = body as {
    wallet?: string;
    item_id?: string;
    auth_status?: string;
    note?: string;
  };

  if (!wallet || !item_id || !auth_status) {
    return NextResponse.json(
      { error: 'wallet, item_id, and auth_status are required' },
      { status: 400 },
    );
  }

  if (!(VALID_STATUSES as readonly string[]).includes(auth_status)) {
    return NextResponse.json(
      { error: `auth_status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const ownsWallet = await callerOwnsWallet(req, wallet);
  if (!ownsWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdminRole(wallet, 'authenticator'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('items')
    .update({
      auth_status: auth_status as AuthStatus,
      auth_note: note ?? null,
      authenticated_at: new Date().toISOString(),
      authenticated_by: wallet,
    })
    .eq('id', item_id);

  if (error) {
    // Migration_trust pending — auth_status & friends don't exist yet. Signal "try later"
    // (503) rather than a hard 500 so the admin UI can show a sensible message.
    const missing =
      error.code === '42703' || error.code === '42P01' || error.code === 'PGRST205' ||
      !!error.message?.includes('does not exist') || !!error.message?.includes('column');
    return NextResponse.json(
      { error: 'Item authentication is not available yet', detail: error.message },
      { status: missing ? 503 : 500 },
    );
  }

  void logSecurityEvent({ wallet, event: 'item_authenticated', detail: { item_id, auth_status }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });

  if (auth_status === 'authenticated' || auth_status === 'flagged') {
    const { data: item } = await supabase
      .from('items')
      .select('current_owner_wallet')
      .eq('id', item_id)
      .maybeSingle();
    if (item?.current_owner_wallet) {
      const flagged = auth_status === 'flagged';
      await notify({
        recipient_wallet: item.current_owner_wallet,
        type: flagged ? 'item_flagged' : 'item_authenticated',
        title: flagged ? 'Your item was flagged' : 'Your item was authenticated',
        body: flagged
          ? 'A moderator flagged this listing for review.'
          : 'A moderator verified this item as genuine.',
        link: '/item/' + item_id,
        data: { auth_status },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
