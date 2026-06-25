import { NextResponse } from 'next/server';
import { settleSdkOrderCrypto } from '@/lib/sdk-settle';

export const dynamic = 'force-dynamic';

// Crypto-balance VisbyPay: the buyer client-signed a SOL transfer to the treasury; we verify it on-chain
// and settle (mint + webhook). No bearer auth needed — the on-chain signer check IS the proof of who paid
// (same model as /api/sol-pay): the NFT mints only to the wallet that actually signed the transfer.
export async function POST(req: Request) {
  try {
    const { session_id, buyer_wallet, tx_signature, quoted_sol_price } = await req.json();
    if (!session_id || !buyer_wallet || !tx_signature) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (buyer_wallet.startsWith('0x') || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(buyer_wallet)) {
      return NextResponse.json({ error: 'A valid Solana wallet is required' }, { status: 400 });
    }

    const r = await settleSdkOrderCrypto({ session_id, buyer_wallet, tx_signature, quoted_sol_price });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, order_id: session_id, minted: r.minted, nft_address: r.nft_address, success_url: r.success_url });
  } catch (err: unknown) {
    console.error('[sdk/charge-wallet]', err);
    return NextResponse.json({ error: 'Payment processing error' }, { status: 500 });
  }
}
