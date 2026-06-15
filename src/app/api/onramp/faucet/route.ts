import { NextResponse } from 'next/server';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { sendSolFromAuthority, getSolBalance } from '@/lib/solana-fund';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAUCET_LAMPORTS = 200_000_000; // 0.2 SOL
const FAUCET_SOL = FAUCET_LAMPORTS / LAMPORTS_PER_SOL;

export async function POST(req: Request) {
  try {
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
