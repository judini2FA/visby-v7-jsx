import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

const RPC = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';

// Poll the signature until it's confirmed/finalized. A confirmation TIMEOUT is NOT treated as a failure:
// the transaction is already broadcast, and /api/transfer/confirm verifies it on-chain server-side, so we
// return quietly and let that be the source of truth. Only an explicit on-chain error throws.
async function awaitConfirmation(connection: Connection, signature: string, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
      if (value?.err) throw new Error('Transaction failed on-chain');
      if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') return;
    } catch (e: any) {
      if (e?.message === 'Transaction failed on-chain') throw e;
      // transient RPC error — keep polling
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  // Timed out waiting. The tx is broadcast; the server confirm will catch it once it lands.
}

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
  // sendRawTransaction throws on preflight failure (insufficient funds, malformed tx) — a real error the
  // caller should surface. Once it resolves, the tx is broadcast and we only ever return its signature.
  const signature = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 5 });
  await awaitConfirmation(connection, signature);
  return signature;
}
