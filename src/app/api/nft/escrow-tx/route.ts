import { NextResponse } from 'next/server';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, transferV1 } from '@metaplex-foundation/mpl-core';
import { createNoopSigner, publicKey as umiKey } from '@metaplex-foundation/umi';
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';
import { getMintAuthority, getRpcUrl } from '@/lib/nft';

// Returns a serialized unsigned MPL Core transfer transaction:
// asset (owner wallet) → mint authority escrow
// The client signs it with their Privy Solana wallet and broadcasts.
export async function POST(req: Request) {
  try {
    const { asset_address, owner_wallet } = await req.json();
    if (!asset_address || !owner_wallet) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const mintAuthority = getMintAuthority();
    const escrowWallet = mintAuthority.publicKey.toBase58();
    const rpcUrl = getRpcUrl();

    const umi = createUmi(rpcUrl).use(mplCore());
    // The owner is the signer — use noop so we don't need their private key server-side
    const ownerSigner = createNoopSigner(umiKey(owner_wallet));
    umi.identity = ownerSigner;
    umi.payer = ownerSigner;

    const tx = await transferV1(umi, {
      asset: umiKey(asset_address),
      newOwner: umiKey(escrowWallet),
    }).buildWithLatestBlockhash(umi);

    const web3Tx = toWeb3JsTransaction(tx);

    // Detect legacy vs versioned transaction
    const isVersioned = 'version' in web3Tx;
    let serialized: string;

    if (isVersioned) {
      serialized = Buffer.from((web3Tx as import('@solana/web3.js').VersionedTransaction).serialize()).toString('base64');
    } else {
      serialized = Buffer.from(
        (web3Tx as import('@solana/web3.js').Transaction).serialize({ requireAllSignatures: false, verifySignatures: false })
      ).toString('base64');
    }

    return NextResponse.json({ transaction: serialized, is_versioned: isVersioned, escrow_wallet: escrowWallet });
  } catch (err: any) {
    console.error('[escrow-tx]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
