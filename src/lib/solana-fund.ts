import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getMintAuthority, getRpcUrl } from './nft';

export async function sendSolFromAuthority(toWallet: string, lamports: number): Promise<string> {
  const authority = getMintAuthority();
  const conn = new Connection(getRpcUrl(), 'confirmed');

  let balance = await conn.getBalance(authority.publicKey);
  // Only auto-airdrop on devnet. Never attempt an airdrop against a mainnet RPC.
  const isDevnet = !getRpcUrl().includes('mainnet');
  if (isDevnet && balance < lamports + 5_000_000) {
    try {
      const sig = await conn.requestAirdrop(authority.publicKey, 1_000_000_000);
      await conn.confirmTransaction(sig, 'confirmed');
      balance = await conn.getBalance(authority.publicKey);
    } catch {
      // Rate-limited on devnet — continue with current balance
    }
  }

  if (balance < lamports + 5_000_000) {
    throw new Error(
      `Authority balance too low (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). ` +
      `Need at least ${((lamports + 5_000_000) / LAMPORTS_PER_SOL).toFixed(4)} SOL.`
    );
  }

  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = authority.publicKey;
  tx.add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: new PublicKey(toWallet),
      lamports,
    })
  );
  tx.sign(authority);

  const rawTx = tx.serialize();
  const signature = await conn.sendRawTransaction(rawTx);
  await conn.confirmTransaction(signature, 'confirmed');
  return signature;
}

export async function getSolBalance(wallet: string): Promise<number> {
  const conn = new Connection(getRpcUrl(), 'confirmed');
  const balance = await conn.getBalance(new PublicKey(wallet));
  return balance / LAMPORTS_PER_SOL;
}
