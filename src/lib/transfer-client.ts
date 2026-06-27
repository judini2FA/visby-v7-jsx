import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

const RPC = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';

export async function sendSol(args: {
  fromWallet: string;
  toWallet: string;
  amountSol: number;
  solWallet: any;
}): Promise<string> {
  const { fromWallet, toWallet, amountSol, solWallet } = args;
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  const connection = new Connection(RPC, 'confirmed');
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = new PublicKey(fromWallet);
  tx.add(SystemProgram.transfer({ fromPubkey: new PublicKey(fromWallet), toPubkey: new PublicKey(toWallet), lamports }));
  const signed = await (solWallet as any).signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}
