import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { from_wallet, to_wallet, item_id, content } = await req.json();

    if (!from_wallet || !to_wallet) {
      return NextResponse.json({ error: 'Missing from_wallet or to_wallet' }, { status: 400 });
    }
    if (!(await callerOwnsWallet(req, from_wallet))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }
    if (content.length > 4000) {
      return NextResponse.json({ error: 'Message exceeds 4000 characters' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Block check — either party blocking the other forbids the message.
    // Two parameterized equality queries (not a raw .or() string) so wallet values
    // can't break out of the filter. Tolerate a missing `blocks` table (treat as no block).
    try {
      const [iBlockedThem, theyBlockedMe] = await Promise.all([
        supabase
          .from('blocks')
          .select('id')
          .eq('blocker_wallet', from_wallet)
          .eq('blocked_wallet', to_wallet)
          .maybeSingle(),
        supabase
          .from('blocks')
          .select('id')
          .eq('blocker_wallet', to_wallet)
          .eq('blocked_wallet', from_wallet)
          .maybeSingle(),
      ]);
      if (iBlockedThem.data || theyBlockedMe.data) {
        return NextResponse.json({ error: "You can't message this user." }, { status: 403 });
      }
    } catch {
      // table absent — treat as no block
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        from_wallet,
        to_wallet,
        content: content.trim(),
        item_id: item_id ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // No 'message'-type notification here: messages have their own unread system (the Messages tab's
    // per-conversation pills + the nav badge via getConversations). Emitting a parallel notification
    // would double-count in the Inbox badge and need separate read-syncing. The feed is for lifecycle
    // and safety events (sales, shipments, reviews, disputes, item-auth) that have no other home.

    return NextResponse.json({ ok: true, message: data });
  } catch (err) {
    console.error('[messages/send] error:', err);
    return NextResponse.json({ error: 'Could not send message' }, { status: 500 });
  }
}
