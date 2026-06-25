import { NextResponse } from 'next/server';
import { finalizeSdkOrder } from '@/lib/sdk-settle';

export const dynamic = 'force-dynamic';

// Manual card flow: the buyer client-confirmed a PaymentIntent (from /api/sdk/payment-intent); we verify
// it cleared and run the shared settlement (mint + webhook). One-tap saved-card uses /api/sdk/charge-saved.
export async function POST(req: Request) {
  try {
    const { session_id, buyer_wallet, payment_intent_id } = await req.json();
    if (!session_id || !buyer_wallet || !payment_intent_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    // Fail closed on a bad wallet — minting to an ETH/garbage address would burn the payment with no NFT.
    if (buyer_wallet.startsWith('0x') || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(buyer_wallet)) {
      return NextResponse.json({ error: 'A valid Solana buyer wallet is required' }, { status: 400 });
    }

    const r = await finalizeSdkOrder({ session_id, buyer_wallet, payment_intent_id });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, minted: r.minted, nft_address: r.nft_address, success_url: r.success_url });
  } catch (err: unknown) {
    console.error('[sdk/settle]', err);
    return NextResponse.json({ error: 'Settlement error' }, { status: 500 });
  }
}
