import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { moovConfigured } from '@/lib/moov';
import { settleSdkOrderMoov } from '@/lib/sdk-settle';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLATFORM_ACCOUNT_ID = process.env.MOOV_PLATFORM_ACCOUNT_ID;

// One-tap / manual VisbyPay CARD checkout on MOOV (never Stripe). The buyer's PAN goes browser → Moov vault
// directly (MoovCardForm), so the server only ever receives (account_id, card_id). We authenticate the
// caller (charging a card requires proving they own the buyer wallet — the Tally mints to that wallet), then
// the shared settlement charges the card into the platform wallet and mints. Server-priced from the order.
export async function POST(req: Request) {
  if (!moovConfigured() || !PLATFORM_ACCOUNT_ID) {
    return NextResponse.json({ error: 'moov_not_configured' }, { status: 503 });
  }
  try {
    const { session_id, buyer_wallet, account_id, card_id } = await req.json();
    if (!session_id || typeof session_id !== 'string') return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    if (!account_id || typeof account_id !== 'string') return NextResponse.json({ error: 'account_id required' }, { status: 400 });
    if (typeof buyer_wallet !== 'string' || buyer_wallet.startsWith('0x') || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(buyer_wallet)) {
      return NextResponse.json({ error: 'A valid Solana wallet is required' }, { status: 400 });
    }
    if (!(await callerOwnsWallet(req, buyer_wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = await rateLimit(`sdk-moov-charge:${buyer_wallet}`, { limit: 8, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const result = await settleSdkOrderMoov({
      session_id,
      buyer_wallet,
      account_id,
      card_id: typeof card_id === 'string' ? card_id : undefined,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, minted: result.minted, nft_address: result.nft_address, success_url: result.success_url });
  } catch (err) {
    console.error('[sdk/moov-charge]', err);
    return NextResponse.json({ error: 'Could not process card payment' }, { status: 500 });
  }
}
