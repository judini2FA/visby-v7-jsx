import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { wallet, from_wallet } = await req.json();

    if (!wallet || !from_wallet) {
      return NextResponse.json({ error: 'Missing wallet or from_wallet' }, { status: 400 });
    }
    if (!(await callerOwnsWallet(req, wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('to_wallet', wallet)
      .eq('from_wallet', from_wallet)
      .eq('read', false);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[messages/read] error:', err);
    return NextResponse.json({ error: 'Could not mark messages read' }, { status: 500 });
  }
}
