import { Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, transferV1 } from '@metaplex-foundation/mpl-core';
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

// Transfer an NFT that the mint authority currently holds to any wallet
export async function transferFromAuthority(assetAddress: string, toWallet: string): Promise<string> {
  const { umi } = getAuthorityUmi();
  const { signature } = await transferV1(umi, {
    asset: umiKey(assetAddress),
    newOwner: umiKey(toWallet),
  }).sendAndConfirm(umi);
  return Buffer.from(signature).toString('base64');
}
