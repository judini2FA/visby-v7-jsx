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
import { checkSerial } from '@/lib/serial-registry';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { callerOwnsWallet } from '@/lib/auth';
import { captureError } from '@/lib/monitoring';

export async function POST(req: Request) {
  try {
    // Unauthenticated and expensive (on-chain mint + devnet airdrop) — throttle hard per IP so it can't
    // be hammered to spam mints or drain the faucet.
    const rl = await rateLimit(`mint:${clientIp(req)}`, { limit: 8, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const body = await req.json();
    const { name, serial_number, category, description, owner_wallet, destination_wallet, image_url, is_listed, price_usdc,
            weight_oz, length_in, width_in, height_in, ship_service_pref } = body;

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

    // Auth: the caller must prove (via their Privy token) that they control owner_wallet — otherwise
    // anyone could mint forged provenance NFTs / create listings attributed to any victim wallet.
    if (!(await callerOwnsWallet(req, owner_wallet))) {
      return NextResponse.json({ error: 'Not authorized for that wallet — please sign in.' }, { status: 401 });
    }

    // Tally Destination: mint into the seller's chosen Solana wallet when set + valid, else their wallet.
    const tallyOwner = (typeof destination_wallet === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destination_wallet))
      ? destination_wallet
      : owner_wallet;

    // Brand serial-number registry gate. Reject a serial that claims a registered brand but is outside
    // its registered space (likely counterfeit) BEFORE the irreversible on-chain mint. A genuine match is
    // stamped onto the item; unregistered serials pass through. Fail-open if the registry is absent.
    const verdict = await checkSerial(serial_number);
    if (verdict.verdict === 'rejected') {
      return NextResponse.json({ error: verdict.reason, brand: verdict.brand, serial_rejected: true }, { status: 422 });
    }
    const brand = verdict.verdict === 'verified' ? verdict.brand : null;
    const serial_status = verdict.verdict === 'verified' ? 'verified' : 'unregistered';

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
      owner: tallyOwner,
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
      owner: umiKey(tallyOwner),
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
        current_owner_wallet: tallyOwner,
        image_url: image_url ?? null,
        is_listed: is_listed ?? false,
        price_usdc: is_listed && price_usdc ? price_usdc : null,
        listed_at: is_listed ? new Date().toISOString() : null,
        weight_oz:  weight_oz  ?? null,
        length_in:  length_in  ?? null,
        width_in:   width_in   ?? null,
        height_in:  height_in  ?? null,
        ship_service_pref: ship_service_pref ?? 'cheapest_2day',
        arweave_metadata_url: metadataUri,
      })
      .select()
      .single();

    if (itemError) {
      console.error('[mint] DB insert failed:', JSON.stringify(itemError));
      captureError(itemError, { stage: 'mint DB insert', mint_address: mintAddress, tx_hash: txHash });
      return NextResponse.json({
        error: 'DB save failed: ' + itemError.message,
        mint_address: mintAddress,
        tx_hash: txHash,
        warning: 'NFT minted but DB record failed: ' + itemError.message,
      });
    }

    // Stamp the brand-verified verdict. Separate, tolerant update so a pre-migration schema (no brand /
    // serial_status columns) still records the item cleanly — unregistered is the column default anyway,
    // so only a positive match needs stamping. 42703/PGRST204 = columns absent (expected pre-migration).
    if (brand) {
      const { error: stampErr } = await supabase
        .from('items').update({ brand, serial_status }).eq('id', item.id);
      if (stampErr && stampErr.code !== '42703' && stampErr.code !== 'PGRST204') {
        console.error('[mint] brand stamp failed', { item_id: item.id, error: stampErr.message });
      }
    }

    await supabase.from('ownership_history').insert({
      item_id: item.id,
      owner_wallet: tallyOwner,
      tx_hash: txHash,
      event_type: 'mint',
    });

    return NextResponse.json({
      mint_address: mintAddress,
      tx_hash: txHash,
      item_id: item.id,
      brand,
      serial_status,
    });
  } catch (err: any) {
    console.error('Mint error:', err);
    captureError(err, { stage: 'mint POST' });
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
