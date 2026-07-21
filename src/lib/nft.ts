import { Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, fetchAsset, transfer } from '@metaplex-foundation/mpl-core';
import { keypairIdentity, publicKey as umiKey } from '@metaplex-foundation/umi';

// SINGLE CUSTODY BOUNDARY — the only place the raw mint-authority secret is materialized into a
// Keypair. Every mint/transfer path routes through here, so migrating custody off a plaintext env var
// (mainnet: AWS Nitro Enclave or an Ed25519-capable HSM/MPC signer like Turnkey/Fireblocks — vanilla
// AWS KMS can't sign Ed25519) is a one-function change, not a codebase sweep. Never log `secret` or
// the returned `secretKey`. Throws 'not set' when unconfigured; a JSON.parse error means malformed.
export function getMintAuthority(): Keypair {
  const secret = process.env.MINT_AUTHORITY_SECRET_KEY;
  if (!secret || secret === '[]') throw new Error('MINT_AUTHORITY_SECRET_KEY not set');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
}

export function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
}

export function getAuthorityUmi() {
  const mintAuthority = getMintAuthority();
  const umi = createUmi(getRpcUrl()).use(mplCore());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(mintAuthority.secretKey);
  umi.use(keypairIdentity(umiKeypair));
  return { umi, mintAuthority };
}

// Transfer an NFT to any wallet, using the authority's signing power.
// We FETCH the asset first so mpl-core resolves the current owner + plugins before building the transfer.
// This is REQUIRED for the SDK path, where the asset is owned by the MERCHANT and moved to the buyer by
// the authority acting as its PermanentTransferDelegate: passing only the pubkey to transferV1 panics on
// the delegate path (it works only when signer == owner, e.g. the normal marketplace mint). Fetch+transfer
// works for both, so this is the single correct call site.
export async function transferFromAuthority(
  assetAddress: string,
  toWallet: string,
  // Bound the in-request work for latency-sensitive callers. The Stripe webhook path passes a tight
  // budget: its asset was minted at listing time (already indexed), so it never needs the long
  // read-after-write loop, and hanging here risks tripping Stripe's delivery timeout (a "no response"
  // error that, accumulated, auto-disables the endpoint). Defaults preserve the original behavior for
  // every other caller.
  opts?: { fetchAttempts?: number; sendAttempts?: number; fetchDelayMs?: number },
): Promise<string> {
  const { umi } = getAuthorityUmi();
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const fetchAttempts = opts?.fetchAttempts ?? 8;
  const sendAttempts  = opts?.sendAttempts ?? 3;
  const fetchDelayMs  = opts?.fetchDelayMs ?? 1500;

  // READ-AFTER-WRITE: immediately after createV1, the RPC node serving this call often hasn't indexed the
  // new asset account yet, so fetchAsset throws "account not found". In the SDK settle path the transfer
  // runs microseconds after the mint, so this is the common case — a bare fetch would fail, the caller
  // swallows it (transfer is non-fatal), and the buyer is left without their Tally while the order still
  // reports 'minted'. Retry the fetch until the asset is visible.
  let asset: Awaited<ReturnType<typeof fetchAsset>> | null = null;
  let fetchErr: unknown;
  for (let i = 0; i < fetchAttempts; i++) {
    try { asset = await fetchAsset(umi, umiKey(assetAddress)); break; }
    catch (e) { fetchErr = e; if (i < fetchAttempts - 1) await sleep(fetchDelayMs); }
  }
  if (!asset) throw fetchErr ?? new Error('asset not found for transfer');

  // Retry the transfer itself on transient RPC/confirm errors.
  let sendErr: unknown;
  for (let i = 0; i < sendAttempts; i++) {
    try {
      const { signature } = await transfer(umi, { asset, newOwner: umiKey(toWallet) }).sendAndConfirm(umi);
      return Buffer.from(signature).toString('base64');
    } catch (e) { sendErr = e; await sleep(1500); }
  }
  throw sendErr ?? new Error('transfer failed');
}
