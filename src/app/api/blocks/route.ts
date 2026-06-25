import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Migration_trust may not be applied yet — treat an absent `blocks` table as a no-op
// rather than a 500, matching how messages/send and reports tolerate it.
function tableMissing(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || !!error.message?.includes('does not exist'));
}

export async function POST(req: Request) {
  try {
    const { blocker_wallet, blocked_wallet } = await req.json();
    if (!blocker_wallet || !blocked_wallet) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (!(await callerOwnsWallet(req, blocker_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('blocks')
      .upsert(
        { blocker_wallet, blocked_wallet },
        { onConflict: 'blocker_wallet,blocked_wallet', ignoreDuplicates: true }
      );
    if (error && !tableMissing(error)) {
      console.error('[api/blocks POST] supabase error:', error.message);
      return NextResponse.json({ error: 'Could not block user' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/blocks POST] error:', err);
    return NextResponse.json({ error: 'Could not block user' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { blocker_wallet, blocked_wallet } = await req.json();
    if (!blocker_wallet || !blocked_wallet) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (!(await callerOwnsWallet(req, blocker_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_wallet', blocker_wallet)
      .eq('blocked_wallet', blocked_wallet);
    if (error && !tableMissing(error)) {
      console.error('[api/blocks DELETE] supabase error:', error.message);
      return NextResponse.json({ error: 'Could not unblock user' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/blocks DELETE] error:', err);
    return NextResponse.json({ error: 'Could not unblock user' }, { status: 500 });
  }
}
