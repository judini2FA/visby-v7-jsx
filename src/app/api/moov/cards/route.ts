export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { moovConfigured, listMoovCards } from '@/lib/moov';
import { createServiceClient } from '@/lib/supabase/service';

// Lists the buyer's saved Moov cards for one-tap checkout. moov_cards is the source of truth for which
// card is the default (Moov's card resource has no default concept); brand/last4/expiration are refreshed
// live from Moov per account so a card removed on Moov's side is never offered. card-token reuses one
// Moov account per wallet once a card is on file, so a single live lookup covers every saved row.
export async function GET(req: Request) {
  if (!moovConfigured()) return NextResponse.json({ cards: [] });

  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ cards: [] });

  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.includes(wallet)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await rateLimit(`moov-cards:${wallet}`, { limit: 30, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  try {
    const supabase = createServiceClient();
    const { data: rows } = await supabase
      .from('moov_cards')
      .select('moov_account_id, card_id, is_default')
      .eq('wallet', wallet)
      .order('created_at', { ascending: false });
    if (!rows || rows.length === 0) return NextResponse.json({ cards: [] });

    const accountsSeen = new Set<string>();
    const liveById = new Map<string, any>();
    for (const row of rows) {
      if (accountsSeen.has(row.moov_account_id)) continue;
      accountsSeen.add(row.moov_account_id);
      const live = await listMoovCards(row.moov_account_id).catch(() => []);
      for (const c of live) if (c?.cardID) liveById.set(c.cardID, c);
    }

    const cards = rows
      .map(row => {
        const live = liveById.get(row.card_id);
        if (!live) return null; // card removed on Moov's side since we saved it
        return {
          account_id: row.moov_account_id,
          card_id: row.card_id,
          brand: live.brand ?? null,
          last4: live.lastFourCardNumber ?? null,
          exp: live.expiration?.month && live.expiration?.year ? `${live.expiration.month}/${live.expiration.year}` : null,
          is_default: !!row.is_default,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return NextResponse.json({ cards });
  } catch {
    return NextResponse.json({ cards: [] });
  }
}
