import { Connection, Keypair } from '@solana/web3.js';
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
import { transferFromAuthority, getRpcUrl, getMintAuthority } from '@/lib/nft';
import { checkSerial } from '@/lib/serial-registry';

type MintArgs = {
  merchant_wallet: string;
  buyer_wallet: string;
  product_name: string;
  serial_number: string;
  category?: string;
  description?: string;
  image_url?: string | null;
};

type MintResult =
  | { ok: true; mint_address: string; item_id: string; mint_tx: string; transfer_tx: string | null }
  | { ok: false; error: string };

// Provenance is recorded owner0 = merchant (mint), owner1 = buyer (transfer).
// We always mint to the merchant first so the on-chain history reflects that the
// authentic good originated with the partner, then move it to the buyer who paid.
export async function mintProvenanceForSdk(args: MintArgs): Promise<MintResult> {
  try {
    const { merchant_wallet, buyer_wallet, product_name, serial_number } = args;
    const category = args.category || 'Other';
    const description = args.description || '';
    const image_url = args.image_url ?? null;

    if (!merchant_wallet || !buyer_wallet || !product_name || !serial_number) {
      return { ok: false, error: 'Missing required mint fields' };
    }
    if (merchant_wallet.startsWith('0x') || buyer_wallet.startsWith('0x')) {
      return { ok: false, error: 'A Solana wallet is required (got an Ethereum address)' };
    }

    const rpcUrl = getRpcUrl();

    let mintAuthority: Keypair;
    try {
      mintAuthority = getMintAuthority();
    } catch (e: any) {
      const notSet = /not set/.test(e?.message ?? '');
      return { ok: false, error: notSet ? 'MINT_AUTHORITY_SECRET_KEY not set' : 'MINT_AUTHORITY_SECRET_KEY is malformed' };
    }

    const conn = new Connection(rpcUrl, 'confirmed');
    let balance: number;
    try {
      balance = await conn.getBalance(mintAuthority.publicKey);
    } catch (e: any) {
      return { ok: false, error: 'RPC error: ' + (e?.message || 'could not reach Solana') };
    }
    if (balance < 5_000_000) {
      try {
        const sig = await conn.requestAirdrop(mintAuthority.publicKey, 1_000_000_000);
        await conn.confirmTransaction(sig, 'confirmed');
        balance = await conn.getBalance(mintAuthority.publicKey);
      } catch {
        // Airdrop rate-limited — fall through; the mint will fail clearly if unfunded.
      }
    }
    if (balance < 5_000_000) {
      return { ok: false, error: 'Mint authority wallet needs SOL for transaction fees' };
    }

    const umi = createUmi(rpcUrl).use(mplCore());
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(mintAuthority.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    const asset = generateSigner(umi);

    const metadata = {
      name: product_name,
      description,
      serial_number,
      category,
      owner: merchant_wallet,
      minted_at: new Date().toISOString(),
      version: '1.0',
      provenance: 'owner0 = merchant (authentic origin); transferred to buyer as owner1',
    };
    const metadataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

    let mintTx: string;
    let mintAddress: string;
    try {
      const { signature } = await createV1(umi, {
        asset,
        name: `${product_name} | SN:${serial_number}`,
        uri: metadataUri,
        owner: umiKey(merchant_wallet),
        plugins: [
          pluginAuthorityPair({
            type: 'PermanentTransferDelegate',
            authority: addressPluginAuthority(umiKey(mintAuthority.publicKey.toBase58())),
          }),
        ],
      }).sendAndConfirm(umi);
      mintTx = Buffer.from(signature).toString('base64');
      mintAddress = asset.publicKey.toString();
    } catch (e: any) {
      return { ok: false, error: 'Mint failed: ' + (e?.message || 'unknown error') };
    }

    const supabase = createServiceClient();
    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        name: product_name,
        serial_number,
        category,
        description,
        nft_mint_address: mintAddress,
        current_owner_wallet: merchant_wallet,
        image_url,
        is_listed: false,
        arweave_metadata_url: metadataUri,
      })
      .select()
      .single();

    if (itemError || !item) {
      return { ok: false, error: 'DB save failed: ' + (itemError?.message || 'no row returned') };
    }

    // Stamp the brand-verified verdict on the item (the /api/sdk/checkout gate already rejected a
    // counterfeit-signalling serial pre-payment; this never blocks — the buyer has paid). Tolerant:
    // skip silently if the registry columns aren't migrated yet (42703/PGRST204).
    try {
      const verdict = await checkSerial(serial_number);
      if (verdict.verdict === 'verified') {
        const { error: stampErr } = await supabase
          .from('items').update({ brand: verdict.brand, serial_status: 'verified' }).eq('id', item.id);
        if (stampErr && stampErr.code !== '42703' && stampErr.code !== 'PGRST204') {
          console.error('[sdk-mint] brand stamp failed', { item_id: item.id, error: stampErr.message });
        }
      }
    } catch { /* registry unavailable — leave default 'unregistered' */ }

    await supabase.from('ownership_history').insert({
      item_id: item.id,
      owner_wallet: merchant_wallet,
      tx_hash: mintTx,
      event_type: 'mint',
    });

    // Payment already succeeded before we got here, so a transfer failure must NOT
    // void the settle — the item exists owned by the merchant and the provenance
    // transfer can be retried out-of-band. Report transfer_tx: null in that case.
    let transferTx: string | null = null;
    try {
      transferTx = await transferFromAuthority(mintAddress, buyer_wallet);
      await supabase
        .from('items')
        .update({ current_owner_wallet: buyer_wallet })
        .eq('id', item.id);
      await supabase.from('ownership_history').insert({
        item_id: item.id,
        owner_wallet: buyer_wallet,
        from_wallet: merchant_wallet,
        tx_hash: transferTx,
        event_type: 'transfer',
      });
    } catch {
      transferTx = null;
    }

    return { ok: true, mint_address: mintAddress, item_id: item.id, mint_tx: mintTx, transfer_tx: transferTx };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Internal mint error' };
  }
}
