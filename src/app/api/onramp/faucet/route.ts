import { NextResponse } from 'next/server';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { sendSolFromAuthority, getSolBalance } from '@/lib/solana-fund';
import { getRpcUrl } from '@/lib/nft';
import { callerOwnsWallet } from '@/lib/auth';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAUCET_LAMPORTS = 200_000_000; // 0.2 SOL
const FAUCET_SOL = FAUCET_LAMPORTS / LAMPORTS_PER_SOL;

export async function POST(req: Request) {
  try {
    // Hard-block on mainnet: this hands out free SOL from the mint-authority/treasury keypair (the same
    // float that funds payouts + signs NFT transfers). It's a devnet-only convenience — on a real RPC it
    // would let anyone drain the treasury.
    if (getRpcUrl().includes('mainnet')) {
      return NextResponse.json({ error: 'Faucet is disabled on mainnet' }, { status: 503 });
    }

    // Throttle hard per IP before doing any work — even gated by auth, this disburses real SOL.
    const ipRl = await rateLimit(`faucet:ip:${clientIp(req)}`, { limit: 5, windowSec: 60 });
    if (!ipRl.allowed) return tooManyRequests(ipRl.retryAfterSec);

    const { wallet } = await req.json();
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    }
    if (wallet.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Ethereum address supplied — a Solana address is required' },
        { status: 400 }
      );
    }

    // Auth: the caller must prove (via their Privy token) that they control the destination wallet, so the
    // faucet only tops up the requester's own wallet — never an arbitrary attacker-supplied address.
    if (!(await callerOwnsWallet(req, wallet))) {
      return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });
    }

    // Per-wallet cap so a single wallet can't be funneled top-ups from many IPs.
    const walletRl = await rateLimit(`faucet:wallet:${wallet}`, { limit: 3, windowSec: 3600 });
    if (!walletRl.allowed) return tooManyRequests(walletRl.retryAfterSec);

    const tx = await sendSolFromAuthority(wallet, FAUCET_LAMPORTS);
    const new_balance = await getSolBalance(wallet);

    return NextResponse.json({
      ok: true,
      tx,
      asset: 'SOL',
      sol_amount: FAUCET_SOL,
      lamports: FAUCET_LAMPORTS,
      new_balance,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
