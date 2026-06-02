import { NextResponse } from 'next/server';
import {
    Connection,
    Keypair,
    clusterApiUrl,
  } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, createV1, fetchAssetV1 } from '@metaplex-foundation/mpl-core';
import { generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
    try {
          const body = await req.json();
          const { name, serial_number, condition, category, description, owner_wallet } = body;

          if (!name || !serial_number || !owner_wallet) {
                  return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
                }

          // Connect to Solana devnet
          const rpcUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
            'https://api.devnet.solana.com';

          // Use a server-side mint authority keypair (from env)
          // In production this would be a proper keypair management system
          const mintAuthoritySecret = process.env.MINT_AUTHORITY_SECRET_KEY;
          let mintAuthority: Keypair;

          if (mintAuthoritySecret) {
                  mintAuthority = Keypair.fromSecretKey(
                            Buffer.from(JSON.parse(mintAuthoritySecret))
                          );
                } else {
                  // Generate a temporary keypair for devnet testing
                  mintAuthority = Keypair.generate();
                }

          // Initialize UMI
          const umi = createUmi(rpcUrl).use(mplCore());
          const umiKeypair = umi.eddsa.createKeypairFromSecretKey(mintAuthority.secretKey);
          umi.use(keypairIdentity(umiKeypair));

          // Generate a new mint signer for the NFT
          const asset = generateSigner(umi);

          // Build the NFT metadata (stored on Arweave via uri)
          // For Phase 1, we store metadata as a JSON string in name field and use a placeholder URI
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

          // Metadata URI (in Phase 1 we use a data URI; Phase 2 will upload to Arweave)
          const metadataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

          // Mint the NFT using Metaplex Core
          const { signature } = await createV1(umi, {
                  asset,
                  name: `${name} | SN:${serial_number}`,
                  uri: metadataUri,
                }).sendAndConfirm(umi);

          const txHash = Buffer.from(signature).toString('base64');
          const mintAddress = asset.publicKey.toString();

          // Record in Supabase
          const supabase = await createClient();
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
                      is_listed: false,
                      arweave_metadata_url: metadataUri,
                    })
            .select()
            .single();

          if (itemError) {
                  // Return success even if DB record fails — NFT is already on chain
                  console.error('Supabase insert error:', itemError);
                  return NextResponse.json({
                            mint_address: mintAddress,
                            tx_hash: txHash,
                            warning: 'NFT minted but DB record failed: ' + itemError.message,
                          });
                }

          // Record first ownership
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
