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
import { getRpcUrl, getMintAuthority } from '@/lib/nft';
import { checkSerial } from '@/lib/serial-registry';
import { generateCutout } from '@/lib/cutout';

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
    // Fail LOUDLY on a non-address (e.g. a placeholder like 'demo-shop') instead of throwing deep in
    // createV1 with a Sentry-only error — the settle marks 'failed' either way, but this names the cause.
    const isSolAddress = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
    if (!isSolAddress(merchant_wallet)) return { ok: false, error: `merchant_wallet is not a valid Solana address: ${merchant_wallet}` };
    if (!isSolAddress(buyer_wallet)) return { ok: false, error: `buyer_wallet is not a valid Solana address: ${buyer_wallet}` };

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
      owner: buyer_wallet,
      origin_merchant: merchant_wallet,
      minted_at: new Date().toISOString(),
      version: '1.0',
      provenance: 'minted for the buyer by Visby on the merchant\'s behalf (origin_merchant)',
    };
    const metadataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

    let mintTx: string;
    let mintAddress: string;
    try {
      const { signature } = await createV1(umi, {
        asset,
        name: `${product_name} | SN:${serial_number}`,
        uri: metadataUri,
        // Mint DIRECTLY to the buyer — no mint-to-merchant-then-transfer. The transfer step was silently
        // failing on devnet (read-after-write on the just-minted asset), leaving Tallys stuck with the
        // merchant. The buyer is the first Visby owner; the merchant is recorded as origin_merchant.
        owner: umiKey(buyer_wallet),
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
        // items.condition is NOT NULL with a CHECK in ('new','like_new','good','fair'). SDK provenance
        // mints don't collect a condition, so default to 'new' (merchant-sold authentic good). Omitting
        // it made EVERY SDK mint fail the NOT-NULL constraint → buyer charged, no Tally delivered.
        condition: 'new',
        nft_mint_address: mintAddress,
        current_owner_wallet: buyer_wallet,
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

    // Attach a background-removed cutout to the Tally for clean resale photos later. The SDK checkout cuts
    // the photo in the BUYER's browser (option A) and points the order at a .png cutout before payment, so
    // usually image_url is already cut here — skip in that case. Only when it's still a raw photo do we fall
    // back to the server-side fal.ai cutout (no browser was in the loop, or the client cutout failed).
    // Best-effort throughout: if cutout is unavailable the item keeps its raw image_url.
    const alreadyCut = !!image_url && /\.png(\?|$)/i.test(image_url);
    const cutoutUrl = alreadyCut ? null : await generateCutout(image_url);
    if (cutoutUrl) {
      const { error: cutErr } = await supabase.from('items').update({ image_url: cutoutUrl }).eq('id', item.id);
      if (cutErr) console.error('[sdk-mint] cutout attach failed', { item_id: item.id, error: cutErr.message });
    }

    // The Tally is minted directly to the buyer, so the buyer is owner0 — one mint event, no transfer.
    await supabase.from('ownership_history').insert({
      item_id: item.id,
      owner_wallet: buyer_wallet,
      tx_hash: mintTx,
      event_type: 'mint',
    });

    return { ok: true, mint_address: mintAddress, item_id: item.id, mint_tx: mintTx, transfer_tx: null };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Internal mint error' };
  }
}
