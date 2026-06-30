import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { getMintAuthority, getRpcUrl } from './nft';
import { USDC_MINT, USDC_DECIMALS } from './usdc';

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

// USDC balance of any wallet's associated token account (0 when the account doesn't exist yet).
export async function getUsdcBalance(wallet: string): Promise<number> {
  const conn = new Connection(getRpcUrl(), 'confirmed');
  const ata = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), new PublicKey(wallet));
  try {
    const acct = await getAccount(conn, ata);
    return Number(acct.amount) / 10 ** USDC_DECIMALS;
  } catch {
    return 0;
  }
}

// How much USDC the disbursing treasury (mint authority) currently holds. Used to pre-check before
// charging a card for a USDC on-ramp, so we never take money we can't fulfill.
export async function getAuthorityUsdcBalance(): Promise<number> {
  return getUsdcBalance(getMintAuthority().publicKey.toBase58());
}

// Forward USDC from the treasury (mint authority) to a user. We can't MINT USDC — only Circle can — so the
// treasury must already hold devnet USDC (fund it once from faucet.circle.com). Fails loudly and names the
// exact address to fund when empty, so the UI shows an honest message instead of charging for nothing.
export async function sendUsdcFromAuthority(toWallet: string, amountUsdc: number): Promise<string> {
  const authority = getMintAuthority();
  const conn = new Connection(getRpcUrl(), 'confirmed');
  const mint = new PublicKey(USDC_MINT);
  const fromAta = await getAssociatedTokenAddress(mint, authority.publicKey);
  const toOwner = new PublicKey(toWallet);
  const toAta = await getAssociatedTokenAddress(mint, toOwner);
  const baseUnits = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));

  let have = BigInt(0);
  try {
    have = (await getAccount(conn, fromAta)).amount;
  } catch {
    throw new Error(
      `Treasury USDC account not funded yet — send devnet USDC to ${authority.publicKey.toBase58()} from faucet.circle.com.`
    );
  }
  if (have < baseUnits) {
    throw new Error(
      `Treasury USDC balance too low (have ${(Number(have) / 10 ** USDC_DECIMALS).toFixed(2)} USDC, need ${amountUsdc}). ` +
      `Top up ${authority.publicKey.toBase58()} from faucet.circle.com.`
    );
  }

  // The authority pays the tx fee (and the recipient-ATA rent on first receive) in SOL — keep it funded on devnet.
  const isDevnet = !getRpcUrl().includes('mainnet');
  if (isDevnet && (await conn.getBalance(authority.publicKey)) < 10_000_000) {
    try {
      const sig = await conn.requestAirdrop(authority.publicKey, 1_000_000_000);
      await conn.confirmTransaction(sig, 'confirmed');
    } catch { /* rate-limited — proceed with current balance */ }
  }

  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = authority.publicKey;
  const toAtaInfo = await conn.getAccountInfo(toAta);
  if (!toAtaInfo) tx.add(createAssociatedTokenAccountInstruction(authority.publicKey, toAta, toOwner, mint));
  tx.add(createTransferInstruction(fromAta, toAta, authority.publicKey, baseUnits));
  tx.sign(authority);

  const signature = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(signature, 'confirmed');
  return signature;
}
