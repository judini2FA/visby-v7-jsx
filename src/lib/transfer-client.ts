import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { USDC_MINT, USDC_DECIMALS } from '@/lib/usdc';

const RPC = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';

// Thrown when a signed+broadcast tx never showed up as confirmed within our watch window AND its
// blockhash expired, so we genuinely can't tell client-side whether it landed or was dropped. Carries the
// signature so the caller can ask the SERVER (the source of truth — /api/transfer/confirm re-checks the
// chain directly) instead of guessing. Distinct from a definitive on-chain failure, which throws a plain
// Error and should NOT be retried.
export class TransferUnconfirmedError extends Error {
  signature: string;
  constructor(message: string, signature: string) {
    super(message);
    this.name = 'TransferUnconfirmedError';
    this.signature = signature;
  }
}

// Solana transactions are only valid until their blockhash's `lastValidBlockHeight` — after that the
// network will never include them, no matter how long you wait. The old code sent once and polled
// getSignatureStatus for a fixed 45s, then gave up silently either way: under any devnet congestion the
// tx could be dropped (blockhash expired, RPC only rebroadcasts a handful of times right after submit)
// while the UI still reported a soft "confirming…" success — the root cause of "devnet wasn't actually
// transferring money." This resends the exact same signed bytes on an interval (a signature is the hash
// of the signed tx, so resending is idempotent — at most one copy ever lands) until either it confirms,
// it errors on-chain, or its blockhash truly expires (a hard on-chain rule, not a client-side guess — so
// once expiry is declared, the original tx can NEVER land, and a caller-side retry with a fresh blockhash
// can never double-send).
async function confirmWithResend(
  connection: Connection,
  rawTx: Uint8Array,
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  const POLL_MS = 1500;
  const RESEND_EVERY_MS = 4000;
  let sinceResend = 0;

  while (true) {
    let height = 0;
    try {
      height = await connection.getBlockHeight('confirmed');
    } catch {
      // transient RPC hiccup reading height — fall through and keep polling status this tick
    }
    if (height > lastValidBlockHeight) {
      // One last check: it may have confirmed in the same tick we read an expired height.
      const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true }).catch(() => ({ value: null }));
      if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') return;
      throw new TransferUnconfirmedError('The network was congested and this transfer never confirmed in time.', signature);
    }

    try {
      const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
      if (value?.err) throw new Error('Transaction failed on-chain');
      if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') return;
    } catch (e: any) {
      if (e?.message === 'Transaction failed on-chain') throw e;
      // transient RPC error reading status — keep polling
    }

    if (sinceResend >= RESEND_EVERY_MS) {
      sinceResend = 0;
      connection.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 0 }).catch(() => {
        // A resend can legitimately fail once the original has already landed (e.g. "already processed")
        // — that's success, not an error; the next status poll will see it confirmed.
      });
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    sinceResend += POLL_MS;
  }
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
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = new PublicKey(fromWallet);
  tx.add(SystemProgram.transfer({ fromPubkey: new PublicKey(fromWallet), toPubkey: new PublicKey(toWallet), lamports }));
  const signed = await (solWallet as any).signTransaction(tx);
  const raw = signed.serialize();
  // sendRawTransaction throws on preflight failure (insufficient funds, malformed tx) — a real error the
  // caller should surface. Once it resolves, the tx is broadcast and we hold its signature regardless of
  // what confirmWithResend below decides.
  const signature = await connection.sendRawTransaction(raw, { maxRetries: 3 });
  await confirmWithResend(connection, raw, signature, lastValidBlockHeight);
  return signature;
}

export async function sendUsdc(args: {
  fromWallet: string;
  toWallet: string;
  amountUsdc: number;
  solWallet: any;
}): Promise<string> {
  const { fromWallet, toWallet, amountUsdc, solWallet } = args;
  const connection = new Connection(RPC, 'confirmed');
  const mint = new PublicKey(USDC_MINT);
  const from = new PublicKey(fromWallet);
  const to = new PublicKey(toWallet);
  const fromAta = await getAssociatedTokenAddress(mint, from);
  const toAta = await getAssociatedTokenAddress(mint, to);
  const baseUnits = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;

  // Create the recipient's USDC token account if they don't have one yet (sender pays the rent).
  const toAtaInfo = await connection.getAccountInfo(toAta);
  if (!toAtaInfo) tx.add(createAssociatedTokenAccountInstruction(from, toAta, to, mint));

  tx.add(createTransferInstruction(fromAta, toAta, from, baseUnits));

  const signed = await (solWallet as any).signTransaction(tx);
  const raw = signed.serialize();
  const signature = await connection.sendRawTransaction(raw, { maxRetries: 3 });
  await confirmWithResend(connection, raw, signature, lastValidBlockHeight);
  return signature;
}
