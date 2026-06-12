import { NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
} from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplCore, createV1,
  pluginAuthorityPair, addressPluginAuthority,
} from '@metaplex-foundation/mpl-core';
import {
  generateSigner,
  keypairIdentity,
  publicKey as umiKey,
} from '@metaplex-foundation/umi';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, serial_number, category, description, owner_wallet, image_url, is_listed, price_usdc } = body;

    // Normalize condition to match DB check constraint (lowercase snake_case)
    const conditionMap: Record<string, string> = {
      'New': 'new', 'Like New': 'like_new', 'Excellent': 'good',
      'Good': 'good', 'Fair': 'fair',
    };
    const condition = conditionMap[body.condition] ?? body.condition?.toLowerCase().replace(/\s+/g, '_') ?? 'good';

    if (!name || !serial_number || !owner_wallet) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (owner_wallet.startsWith('0x')) {
      return NextResponse.json({ error: 'owner_wallet is an Ethereum address. A Solana wallet is required — check your Visby dashboard to create one.' }, { status: 400 });
    }

    const rpcUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com';

    const mintAuthoritySecret = process.env.MINT_AUTHORITY_SECRET_KEY;
    let mintAuthority: Keypair;

    if (mintAuthoritySecret && mintAuthoritySecret !== '[]') {
      mintAuthority = Keypair.fromSecretKey(Buffer.from(JSON.parse(mintAuthoritySecret)));
    } else {
      mintAuthority = Keypair.generate();
    }

    // Check mint authority balance — if zero, try airdrop once
    const conn = new Connection(rpcUrl, 'confirmed');
    let balance = await conn.getBalance(mintAuthority.publicKey);
    if (balance < 5_000_000) {
      // Try to airdrop 1 SOL (devnet only)
      try {
        const sig = await conn.requestAirdrop(mintAuthority.publicKey, 1_000_000_000);
        await conn.confirmTransaction(sig, 'confirmed');
        balance = await conn.getBalance(mintAuthority.publicKey);
      } catch {
        // Airdrop failed (rate limited) — continue, will fail at mint if no balance
      }
    }

    if (balance < 5_000_000) {
      return NextResponse.json({
        error: 'Mint authority wallet needs SOL for transaction fees.',
        action: 'fund_wallet',
        mint_authority_address: mintAuthority.publicKey.toBase58(),
        faucet_url: 'https://faucet.solana.com',
      }, { status: 402 });
    }

    // Initialize UMI
    const umi = createUmi(rpcUrl).use(mplCore());
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(mintAuthority.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    const asset = generateSigner(umi);

    const metadata = {
      name,
      description: description || '',
      serial_number,
      condition,
      category: category || 'Other',
      owner: owner_wallet,
      minted_at: new Date().toISOString(),
      version: '1.0',
    };
    const metadataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

    // Mint to owner's wallet; add PermanentTransferDelegate so the mint
    // authority can transfer on behalf of any future seller without escrow.
    const { signature } = await createV1(umi, {
      asset,
      name: `${name} | SN:${serial_number}`,
      uri: metadataUri,
      owner: umiKey(owner_wallet),
      plugins: [
        pluginAuthorityPair({
          type: 'PermanentTransferDelegate',
          authority: addressPluginAuthority(umiKey(mintAuthority.publicKey.toBase58())),
        }),
      ],
    }).sendAndConfirm(umi);

    const txHash = Buffer.from(signature).toString('base64');
    const mintAddress = asset.publicKey.toString();

    const supabase = createServiceClient();
    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        name,
        serial_number,
        condition,
        category: category || 'Other',
        description: description || '',
        nft_mint_address: mintAddress,
        current_owner_wallet: owner_wallet,
        image_url: image_url ?? null,
        is_listed: is_listed ?? false,
        price_usdc: is_listed && price_usdc ? price_usdc : null,
        listed_at: is_listed ? new Date().toISOString() : null,
        arweave_metadata_url: metadataUri,
      })
      .select()
      .single();

    if (itemError) {
      console.error('[mint] DB insert failed:', JSON.stringify(itemError));
      return NextResponse.json({
        error: 'DB save failed: ' + itemError.message,
        mint_address: mintAddress,
        tx_hash: txHash,
        warning: 'NFT minted but DB record failed: ' + itemError.message,
      });
    }

    await supabase.from('ownership_history').insert({
      item_id: item.id,
      owner_wallet,
      tx_hash: txHash,
      event_type: 'mint',
    });

    return NextResponse.json({
      mint_address: mintAddress,
      tx_hash: txHash,
      item_id: item.id,
    });
  } catch (err: any) {
    console.error('Mint error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
