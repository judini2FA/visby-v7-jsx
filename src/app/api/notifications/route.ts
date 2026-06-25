import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// A user's own notifications carry their private info, so the list is gated to the wallet
// owner (the tRPC router only exposes an unread count). Tolerant of a missing table while
// the notifications migration is still pending.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_wallet', wallet)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ notifications: [] });   // table missing → empty, non-fatal
    return NextResponse.json({ notifications: data ?? [] });
  } catch (err) {
    console.error('[notifications] list error:', err);
    return NextResponse.json({ error: 'Could not load notifications' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { wallet, id } = await req.json();

    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    if (id) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .eq('recipient_wallet', wallet);
    } else {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('recipient_wallet', wallet)
        .eq('read', false);
    }

    return NextResponse.json({ ok: true });   // table missing → no-op, non-fatal
  } catch (err) {
    console.error('[notifications] mark-read error:', err);
    return NextResponse.json({ error: 'Could not update notifications' }, { status: 500 });
  }
}
